# Discord dispatch cron

The Discord auto-post dispatcher (`/api/discord/dispatch`) is triggered on a
schedule by a Railway cron service named **`discord-cron`** in the
`fulfilling-ambition` / `production` project. The service runs the
single-shot script `cli/dispatch-tick.ts` (npm script: `cron:dispatch`)
which POSTs to the dispatcher endpoint with the shared secret header.

Before May 2026 the schedule lived in `.github/workflows/discord-dispatch.yml`
on GitHub Actions cron. GHA's free-tier cron skewed 1–4 hours, which made it
miss the narrow time gate the dispatcher used at the time (`utcMinute < 5`).
Two things changed:

1. Dispatcher gained **catch-up semantics** (`lib/discord-dispatcher.ts`):
   a missed weekly/daily slot fires within 6 hours of the scheduled time, and
   reminders catch up within 60 minutes. Idempotency via `last_dispatched_at`
   on subscriptions and the per-post `claimPost` ledger.
2. **Railway cron** replaces GHA as the trigger. Railway's scheduler runs
   on time, so the catch-up logic mostly carries the load only when Railway
   itself has a blip.

## Current state

| Piece                  | Where                                                          |
|------------------------|----------------------------------------------------------------|
| Dispatcher endpoint    | `app/api/discord/dispatch/route.ts` on the `PlayIRL.GG` service|
| Tick worker script     | `cli/dispatch-tick.ts` (run as `npm run cron:dispatch`)        |
| Cron service           | Railway → project `fulfilling-ambition` → service `discord-cron`|
| Cron schedule          | `*/5 * * * *` (every 5 minutes, UTC)                           |
| Env vars on cron       | `DISPATCH_URL`, `DISPATCH_SECRET` (referenced from web service)|
| GHA workflow           | `discord-dispatch.yml` — **manual-only**, no schedule          |

## Verifying it's running

1. **Railway logs** — open the `discord-cron` service → Deployments → most
   recent container log. Each tick should show:

   ```
   > tsx cli/dispatch-tick.ts
   [dispatch-tick] attempt=1 ok status=200 ms=XXX body={"ok":true,...}
   ```

   Most ticks return `digests_posted: 0` (no slot due that minute). When a
   scheduled slot fires, the response body shows `digests_posted: 1` (or more).

2. **Database** — on the prod box:

   ```sql
   SELECT id, name, datetime(last_dispatched_at, 'unixepoch') AS last_fired
   FROM discord_subscriptions
   WHERE enabled=1 AND mode IN ('weekly','daily');
   ```

   `last_fired` should be recent (within the past few minutes/hours after a
   slot has passed).

3. **Activity log** — UI at `/account/discord/<sub-id>` shows runs with
   `trigger='scheduled'` for cron-fired digests and `trigger='manual'` for
   admin-fired ones.

## Manual emergency fire

If Railway is down or you need to push pending digests immediately:

```
gh workflow run discord-dispatch.yml -f force=true \
  --repo PlayIRL/playirl-events
```

…or hit the **Actions** tab in GitHub → **Discord Bot Dispatch** workflow →
**Run workflow** → toggle `force` → Run.

Both Railway and this manual workflow share the same `claimPost` idempotency
ledger, so accidentally running both at once won't double-post.

## Why not GHA's schedule, ever again

The dispatcher *will work* under GHA's cron with the catch-up logic — a tick
within 6 hours of any scheduled slot still posts the digest correctly. But:

- Railway gives accurate-to-the-minute fires; GHA's hourly skew means a "8 AM
  digest" lands somewhere between 8 AM and 11 AM and looks unreliable to users.
- Having two schedulers in flight bloats logs and confuses debugging without
  adding redundancy (claimPost handles dedup; that's not the bottleneck).

If Railway ever becomes a problem, re-enable `schedule:` in the workflow
file as a fallback. Don't run both in parallel as the steady state.
