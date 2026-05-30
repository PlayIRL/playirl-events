import { hasAdminAccess } from "@/lib/session";
import { listUsers, listUsersPaginated, getUserStats } from "@/lib/users";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/**
 * GET /api/admin/users
 *
 * Two modes:
 *   1. Paginated (default for admin /admin/users page) — pass `page`,
 *      `limit`, and/or `include_stats=1`. Returns `{ users, total,
 *      page, limit, stats? }`.
 *   2. Legacy flat array — no `page` / `limit` / `include_stats`.
 *      Returns the array directly. Kept for callers that haven't
 *      migrated to the structured response.
 */
export async function GET(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sp = url.searchParams;
  const role = sp.get("role") ?? undefined;
  const q = sp.get("q") ?? undefined;

  const wantsPaginated = sp.has("page") || sp.has("include_stats") || sp.has("limit");
  if (!wantsPaginated) {
    return NextResponse.json(listUsers({ role, q }));
  }

  const rawLimit = Number(sp.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const rawPage = Number(sp.get("page") ?? "1");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * limit;

  const { users, total } = listUsersPaginated({ role, q }, limit, offset);
  const includeStats = sp.get("include_stats") === "1";
  return NextResponse.json({
    users,
    total,
    page,
    limit,
    stats: includeStats ? getUserStats() : undefined,
  });
}
