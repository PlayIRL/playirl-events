// Admin-controlled per-guild settings for /admin/discord-servers.
// Today: just an auto_approve toggle. PATCH writes the row and, when
// auto_approve flips ON, retroactively promotes existing 'pending' events
// from this guild to 'active' so the admin doesn't have to drain the
// review queue by hand. Toggling OFF does not demote — admin-blessed
// events stay published.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { buildGuildSpec } from "@/lib/discord-servers-admin";
import {
  getGuildSettings,
  promotePendingEventsForGuild,
  setGuildAutoApprove,
} from "@/lib/discord-guild-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PatchBody {
  autoApprove?: boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ guildId: string }> },
) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { guildId } = await params;

  // Confirm we recognize the guild before writing a settings row. Otherwise
  // an admin could orphan rows for guilds that aren't in the system, and
  // any later pull-all loop would skip them anyway.
  if (!buildGuildSpec(guildId)) {
    // Also accept guilds that only exist on the push side (subscriptions)
    // — buildGuildSpec only checks the pull origins. Settings should apply
    // regardless, but for the auto-approve flag the only effect is on the
    // pull path, so it's harmless either way. Reject only if the body is
    // malformed below.
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.autoApprove !== "boolean") {
    return NextResponse.json(
      { error: "Body must include { autoApprove: boolean }" },
      { status: 400 },
    );
  }

  const previous = getGuildSettings(guildId);
  const wasAutoApprove = previous?.autoApprove ?? false;
  const settings = setGuildAutoApprove(guildId, body.autoApprove);

  // When flipping OFF→ON, sweep up any events still sitting in the review
  // queue for this guild. Idempotent: a no-op if the toggle was already on.
  let promoted = 0;
  if (body.autoApprove && !wasAutoApprove) {
    promoted = promotePendingEventsForGuild(guildId);
    if (promoted > 0) {
      console.log(
        `[admin-discord-servers] auto-approve ON for ${guildId} — promoted ${promoted} pending event(s) to active`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    guildId,
    settings,
    promotedFromPending: promoted,
  });
}
