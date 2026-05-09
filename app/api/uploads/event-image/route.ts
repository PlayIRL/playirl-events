import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import { saveUpload, UploadError } from "@/lib/upload-storage";
import { rateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";
// Next runs route handlers on the Node runtime by default; the file-system
// writes in saveUpload need that explicitly when the rest of the app moves
// to edge later.
export const runtime = "nodejs";

// 30 image uploads per user per hour. Generous for normal flows (a host
// uploading a few event images, retrying on failure, replacing one) but
// hard-stops a runaway loop that could fill the volume — at 4 MB max per
// upload, 30/hr = 120 MB/hr/user, recoverable if abuse is noticed within
// hours.
const UPLOAD_LIMIT_PER_HOUR = 30;

export async function POST(request: Request) {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit(`upload:event-image:${user.id}`, UPLOAD_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }

  try {
    const saved = await saveUpload("events", file);
    return NextResponse.json({ url: saved.url });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[upload] event-image failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
