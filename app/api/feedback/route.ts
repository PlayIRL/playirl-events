import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

/**
 * Feedback submission endpoint. Accepts a free-text message + optional
 * reply-to email, optionally a page URL for context, and forwards the
 * lot to the project owner via Brevo's transactional email API
 * (https://developers.brevo.com/reference/sendtransacemail). Pulls the
 * signed-in user (if any) so the email includes "from user@…"
 * automatically — no need for the form to ask for identity twice.
 *
 * Why Brevo: 300 emails/day on the free tier indefinitely, REST API
 * with no SDK to bundle, and the from-address verification model is
 * the same one we already understand from Resend.
 *
 * No persistence — Brevo's send log + your inbox are the record of
 * truth. If feedback volume grows past what an inbox can manage,
 * promote to a DB table here without changing the client.
 */
export const dynamic = "force-dynamic";

const FEEDBACK_TO = process.env.FEEDBACK_TO_EMAIL || "ian.oberholtzer@gmail.com";
const FROM_RAW = process.env.AUTH_EMAIL_FROM || "PlayIRL <noreply@playirl.gg>";

// Parse "Name <email@example.com>" or bare "email@example.com" into the
// {name, email} shape Brevo's API wants. Resend accepted the original
// string format as-is; Brevo doesn't, so we split it here once at
// module load instead of on every request.
const FROM = parseAddress(FROM_RAW);

function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] ?? "").trim(), email: m[2].trim() };
  return { name: "", email: raw.trim() };
}

export async function POST(request: Request) {
  let body: {
    message?: unknown;
    contactEmail?: unknown;
    page?: unknown;
    website?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Honeypot — naive bots fill the hidden `website` field; humans don't.
  // We return 200 (not 400) so bots can't probe the validator.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long (4000 char max)." }, { status: 400 });
  }

  const contactEmail =
    typeof body.contactEmail === "string" && body.contactEmail.trim().length > 0
      ? body.contactEmail.trim()
      : null;
  // Light validation — reject obvious garbage, but don't try to fully
  // parse RFC 5322. The send will fail loudly if Resend rejects it.
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
  }

  const page = typeof body.page === "string" ? body.page.slice(0, 500) : null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown";

  const user = await getCurrentUser();
  const userLine = user
    ? `${user.name ?? "(no name)"} <${user.email}>${user.role === "admin" ? " (admin)" : ""}`
    : "anonymous visitor";

  const replyTo = contactEmail ?? user?.email ?? undefined;

  // Plain-text email. Resend renders text body if no html is given.
  const text = [
    "PlayIRL.GG feedback",
    "",
    `From: ${userLine}`,
    contactEmail ? `Reply-to: ${contactEmail}` : null,
    page ? `Page: ${page}` : null,
    `User-Agent: ${userAgent}`,
    "",
    "--- Message ---",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    // Avoid hard-failing the user-facing flow when the env is misconfigured
    // in dev — log clearly and return a generic error.
    console.error("[feedback] BREVO_API_KEY not set; cannot send feedback email");
    return NextResponse.json(
      { error: "Feedback sending is not configured. Try again later." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        // Brevo uses an `api-key` header (NOT `Authorization: Bearer`).
        "api-key": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: FROM.name ? { name: FROM.name, email: FROM.email } : { email: FROM.email },
        to: [{ email: FEEDBACK_TO }],
        subject: `[PlayIRL feedback] ${truncatePreview(message)}`,
        textContent: text,
        replyTo: replyTo ? { email: replyTo } : undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[feedback] Brevo ${res.status}: ${detail}`);
      return NextResponse.json({ error: "Failed to send. Try again." }, { status: 502 });
    }
  } catch (err) {
    console.error("[feedback] send threw:", err);
    return NextResponse.json({ error: "Network error sending feedback." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

// Squeeze the message into a one-line subject preview without breaking
// on word boundaries — just hard-clip with an ellipsis.
function truncatePreview(s: string, max = 60): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}
