import { hasAdminAccess } from "@/lib/session";
import { getSetting, setSetting } from "@/lib/events";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    scrape_interval_hours: getSetting("scrape_interval_hours"),
    last_scrape: getSetting("last_scrape"),
    last_scrape_result: getSetting("last_scrape_result"),
    // Per-region scrape health (WotC locator). Big-ish JSON blob (~30KB for
    // 197 regions); admin /scrapers page renders it as a sortable table so
    // outliers/failures are visible without diffing scrape_history rows.
    last_scrape_regions_wotc: getSetting("last_scrape_regions_wotc"),
  });
}

export async function PUT(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (body.scrape_interval_hours) {
    setSetting("scrape_interval_hours", body.scrape_interval_hours.toString());
  }

  return NextResponse.json({ ok: true });
}
