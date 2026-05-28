// Discord HTTP Interactions endpoint. Discord PINGs this URL on app
// configuration to validate Ed25519 signature handling, then POSTs every
// slash command here. Verification + routing live in lib/discord-interactions.
//
// Deferred handler pattern: when a command needs to do async work (geocoding,
// DB queries that might exceed 3s), the handler returns { kind: "deferred" }.
// We immediately ack with a "thinking..." response inside Discord's 3-second
// window, then run the work in the background and PATCH the original message
// via webhook follow-up. Discord allows up to 15 minutes for follow-up.

import { NextResponse, after } from "next/server";
import {
  type InteractionHandlerResult,
  handleInteraction,
  sendDeferredFollowups,
  verifyInteractionSignature,
} from "@/lib/discord-interactions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const FLAGS_EPHEMERAL = 1 << 6;

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_BOT_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "DISCORD_BOT_PUBLIC_KEY not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return new NextResponse("missing signature", { status: 401 });
  }

  // Read raw body — must verify against the exact bytes Discord signed,
  // before any JSON.parse normalization.
  const rawBody = await request.text();
  if (!verifyInteractionSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let interaction: Parameters<typeof handleInteraction>[0];
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new NextResponse("malformed body", { status: 400 });
  }

  let result: InteractionHandlerResult;
  try {
    result = handleInteraction(interaction);
  } catch (err) {
    console.error("[discord-interactions] handler threw synchronously:", err);
    return NextResponse.json(
      { type: 4, data: { content: "Something went wrong handling that command.", flags: FLAGS_EPHEMERAL } },
    );
  }

  if (result.kind === "immediate") {
    return NextResponse.json(result.response);
  }

  // Deferred: ack now, do work + follow-up after the response. Use Next.js's
  // `after()` API rather than fire-and-forget — Next 16 cleans up promise
  // chains scheduled outside the request lifecycle, which would silently
  // drop our follow-up PATCH and leave the user staring at "Bot is
  // thinking..." until Discord's 15-minute timeout.
  const work = result.work;
  after(async () => {
    try {
      const followups = await work(interaction);
      await sendDeferredFollowups(interaction.application_id, interaction.token, followups);
    } catch (err) {
      console.error("[discord-interactions] deferred work threw:", err);
      await sendDeferredFollowups(interaction.application_id, interaction.token, [{
        content: "Something went wrong handling that command. Try again, or report this in #playirl-bot-support.",
      }]);
    }
  });

  // Public lookup commands (today/week) opt out of ephemeral so the result
  // lands in the channel for everyone. Admin ops keep the default ephemeral
  // ack so configuration noise stays out of the channel.
  const isEphemeral = result.ephemeral !== false;
  return NextResponse.json({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE — shows "thinking..." to user
    data: isEphemeral ? { flags: FLAGS_EPHEMERAL } : {},
  });
}
