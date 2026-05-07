// Reverse geocode for the "Use my current location" path. Takes raw
// browser-geolocation coords, returns a city/zip label. Nominatim only.
// Rate-limited the same way as the forward endpoint.

import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RateState { count: number; resetAt: number }
const rateLimit = new Map<string, RateState>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 30;

function rateOk(ip: string): boolean {
  const now = Date.now();
  const cur = rateLimit.get(ip);
  if (!cur || cur.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  cur.count++;
  return cur.count <= RL_MAX;
}

export async function POST(req: Request) {
  let body: { latitude?: number; longitude?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Coordinates out of range" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateOk(`geocode-rev:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const hit = await reverseGeocode(lat, lng);
  if (!hit) {
    // Caller falls back to displaying the rounded-md coords.
    return NextResponse.json({ error: "Could not resolve location" }, { status: 404 });
  }
  return NextResponse.json({ label: hit.label });
}
