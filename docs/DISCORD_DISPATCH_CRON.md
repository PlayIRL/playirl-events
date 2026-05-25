# Discord dispatch cron

The Discord auto-post dispatcher (`/api/discord/dispatch`) needs to be
triggered on a schedule. Historically we used GitHub Actions cron, but in
practice GHA cron skews by 1–4+ hours on the free tier — enough that an "8 AM
EDT" weekly digest can miss the day entirely. We now run the trigger as a
Railway cron service.

The dispatcher itself is resilient: as of the catch-up fix in
`lib/discord-dispatcher.ts`, a tick delayed up to **6 hours** past a
scheduled slot will still post the digest once, and a same-slot retry tick
is deduped via `discord_subscriptions.last_dispatched_at`. The cron only
needs to fire roughly every 5–15 minutes; missed individual ticks are
harmless.

## Railway setup

1. **Create a new service in the same Railway project** as the web app.
   "New" → "Empty Service" → connect the same GitHub repo.

2. **Set the start command** to:

   ```
   npm run cron:dispatch
   ```

   This runs `cli/dispatch-tick.ts`, which POSTs to the dispatcher with
   retries (3 attempts, 5s apart) and exits.

3. **Mark the service as a cron job.** In Service Settings → "Cron Schedule",
   set:

   ```
   */5 * * * *
   ```

   Railway's cron is closer to wall-clock accurate than GHA. A 5-min cadence
   gives the catch-up dispatcher plenty of opportunities to land each slot
   on time.

4. **Set environment variables** on the cron service (Variables tab):

   | Var               | Value                                              |
   |-------------------|----------------------------------------------------|
   | `DISPATCH_URL`    | `https://playirl.gg/api/discord/dispatch`          |
   | `DISPATCH_SECRET` | Same value as on the web service                   |

   Reference both via "Add Variable" → "Add Reference" to keep them in sync
   with the web service if it ever rotates.

5. **Deploy.** Railway will show the cron's run history under "Deployments";
   each successful tick should log a single line with status + elapsed ms.

## Verifying

After ~10 minutes of cron uptime, check:

- Railway deployment log shows ticks every ~5 min (no multi-hour gaps).
- `SELECT id, last_dispatched_at FROM discord_subscriptions WHERE enabled=1;`
  shows recent timestamps on enabled subs whose scheduled slot has passed.
- The Activity log on `/account/discord/<sub-id>` shows `trigger='scheduled'`
  rows from now on (manual fires still log as `trigger='manual'`).

## Why not Vercel Cron / Inngest / etc.

We're already on Railway and the app's other infra (DB, scrape worker) lives
there. Adding a second vendor for one cron isn't worth the operational
surface. If Railway cron ever proves unreliable too, Cloudflare Workers
Cron Triggers are a strong fallback — free, accurate, and would only need
the `dispatch-tick.ts` logic ported to a Worker.

## Decommissioning GHA

Once Railway cron has been running on schedule for ~24h:

- Delete `.github/workflows/discord-dispatch.yml`, OR
- Keep it with `workflow_dispatch:` only (remove the `schedule:` block) as
  a manual emergency lever.

Don't run both — duplicate ticks won't double-post (idempotency ledger) but
they confuse the Railway logs.
