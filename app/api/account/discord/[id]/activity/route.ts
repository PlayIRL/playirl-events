// Recent activity for a Discord subscription — what fired when, whether it
// succeeded, how many events / messages it posted, and any error text. Reads
// from the discord_subscription_activity log written by the dispatcher and
// the send-now route.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  listSubscriptionActivity,
  userCanManageSubscription,
} from "@/lib/discord-subscriptions";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!userCanManageSubscription(user.id, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activity = listSubscriptionActivity(id, 25);
  return NextResponse.json({ activity });
}
