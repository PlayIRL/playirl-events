# Production Fill Runbook

Step-by-step to take production from "Philly-only seed (~259 events)" to "fully populated nationwide (~25k–50k events)" and keep it fresh after.

Every step has an exact command. Copy-paste, no guesswork.

## Stuck? Run the diagnostic first

Anytime something looks off — events not appearing, scrape doesn't seem to fire, integrity workflow goes red — your first move is:

```bash
npm run prod:diagnose
```

It probes the live site through five layers (binary deployed, scrape endpoint, lock state, secret match, nationwide-data presence) and prints **a single recommended next step with the exact command to run**. No guessing. Pass `SCRAPE_SECRET` in the env to enable the secret-match check.

```bash
SCRAPE_SECRET=<your secret> npm run prod:diagnose
```

Exits 0 only when production is healthy and CONUS data is present.

---

## Prerequisites

- Push access to the repo
- Railway dashboard access for the playirl.gg service
- A terminal with `node` ≥ 20, `git`, `curl`, and `openssl`
- Local clone with this branch checked out

Generate three secrets up front. You'll set the same values in both Railway env and (where noted) GitHub Actions secrets.

```bash
echo "SCRAPE_SECRET=$(openssl rand -hex 32)"
echo "BACKUP_SECRET=$(openssl rand -hex 32)"
echo "TOPDECK_API_KEY=<get from https://topdeck.gg account settings>"
```

Save these somewhere safe (1Password, your secrets manager). You'll need `SCRAPE_SECRET` locally too.

---

## Step 1 — Set Railway environment variables

In the Railway dashboard for the playirl.gg service → Variables:

| Name | Value | Why |
|---|---|---|
| `SCRAPE_SECRET` | The first random hex from above | Auths Railway Cron's `POST /api/scrape` and the `npm run scrape:trigger` helper |
| `BACKUP_SECRET` | The second random hex from above | Auths the daily backup workflow + integrity check |
| `TOPDECK_API_KEY` | Your TopDeck.gg API key | Activates the TopDeck source (no-op without it) |
| `MTG_SCRAPE_SCOPE` | *(leave unset)* | Defaults to `national`; we only override to `local` in CI |

Don't redeploy yet — set the vars first, then deploy. New env vars take effect on the next boot.

---

## Step 2 — Set GitHub Actions secret

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
|---|---|
| `BACKUP_SECRET` | Same hex as the Railway `BACKUP_SECRET` |

This authorizes `.github/workflows/backup.yml` to pull a daily snapshot from `/api/internal/backup`.

---

## Step 3 — Deploy

Already done on `main` — the nationwide pipeline, fire-and-forget scrape endpoint, and venue pages all shipped between PRs #69 and #99. New work lands on feature branches and merges to `main`; Railway auto-deploys on `main` push. Sanity-check after any deploy:

```bash
curl -s https://playirl.gg/api/health | jq
# Returns: {"ok":true,"eventCount":<thousands>,"lastScrape":"<recent>"}
```

If `eventCount` looks unreasonably low (< 1000) or `lastScrape` is days old, something regressed — jump to "Failure modes & recovery" at the bottom.

---

## Step 4 — Trigger the first nationwide scrape

The Phase 1 fire-and-forget changes mean this is a one-line operation. From your laptop:

```bash
export SCRAPE_SECRET=<the secret you set on Railway>
npm run scrape:trigger
```

Expected output:

```
🃏 Triggering production scrape at https://playirl.gg

Before: 259 events, last scrape 2026-04-...
✓ Scrape started at 2026-05-04T... (source: cron)

  [0.5min] events=259 (Δ+0)  lastScrape=2026-04-...  stable=0/3
  [1.0min] events=412 (Δ+153)  lastScrape=2026-04-...  stable=0/3
  [3.5min] events=8742 (Δ+8483)  lastScrape=...  stable=0/3
  [12.0min] events=27516 (Δ+27257)  lastScrape=2026-05-04T...  stable=2/3
  [12.5min] events=27516 (Δ+27257)  lastScrape=2026-05-04T...  stable=3/3

✅ Done. 27516 events (Δ +27257 from baseline).
   Last scrape: 2026-05-04T...

Next: visit /admin/scrapers for per-source breakdown, or hit /?lat=40.728&lng=-73.946&radius=5 to spot-check NYC.
```

**Cold-run timing:** the very first scrape on prod takes 10–15 minutes because Nominatim has to be hit once per US WotC store (~3,000) at 1.1 sec each. Subsequent scrapes hit the geocode cache and finish in 2–3 minutes.

If the script hits its 25-min poll ceiling, the scrape may still be running on the server. Visit `https://playirl.gg/admin/scrapers` to check live status, or just wait 5 more minutes and re-run `scrape:trigger` — it'll detect the in-flight scrape (HTTP 409) and switch to polling mode automatically.

---

## Step 5 — Verify the data

Five quick spot-checks. Each one should now return events.

```bash
# 1. NYC (the original 11222 question)
open "https://playirl.gg/?lat=40.728&lng=-73.946&radius=5"

# 2. LA
open "https://playirl.gg/?lat=34.05&lng=-118.24&radius=10"

# 3. Chicago
open "https://playirl.gg/?lat=41.88&lng=-87.63&radius=10"

# 4. Austin
open "https://playirl.gg/?lat=30.27&lng=-97.74&radius=10"

# 5. Per-source breakdown in admin
open "https://playirl.gg/admin/scrapers"
# "Recent runs" table shows the just-completed scrape with bySource:
# { wizards-locator: ~25000, topdeck: ~3000, discord: ~10 }
```

---

## Step 6 — Wire the daily refresh

Now that the manual fill works, schedule it. In the Railway dashboard for the playirl.gg service → Settings → Cron Jobs (or however your team sets up cron — Railway has changed this UI a few times):

```
Schedule: 0 9 * * *
Command:  curl -fsS -X POST https://playirl.gg/api/scrape -H "x-scrape-secret: $SCRAPE_SECRET" -w "HTTP %{http_code}\n"
```

`9 UTC` = 4-5am Eastern. Picks an off-hours window so nightly events get ingested before users are awake. Leaves the 10am UTC GitHub Actions window for the static ICS commits to land separately.

Verify after the first scheduled run:

```bash
curl -s https://playirl.gg/api/health | jq '.lastScrape'
# Should show today's 9am UTC timestamp (or close to it)
```

### Also add a Discord-only frequent pull

The full scrape above only runs once a day. Connected Discord servers can create new scheduled events at any time, and users (rightly) expect those to show up in PlayIRL much faster than "tomorrow morning." Add a second Railway Cron entry pointing at `/api/scrape-discord`:

```
Schedule: */15 * * * *
Command:  curl -fsS -X POST https://playirl.gg/api/scrape-discord -H "x-scrape-secret: $SCRAPE_SECRET" -w "HTTP %{http_code}\n"
```

Every 15 minutes, Discord-only (1-2 API calls per guild, completes in seconds). Same `SCRAPE_SECRET` as the main scrape. Uses a separate lock so it never 409s itself against the daily heavy scrape.

If a guild's events still look stale after the cron tick, the admin "Pull now" button on `/admin/discord-servers` runs the exact same code path on demand.

---

## Step 7 — Verify the daily backup is working

The backup workflow already exists at `.github/workflows/backup.yml` and runs daily at 11am UTC. After 24 hours:

```
GitHub repo → Actions → DB Backup → most recent run → Artifacts
```

You should see `mtg-cal-db-backup` (e.g. `mtg-cal-20260505-110001.db.gz`). Download to confirm gzip integrity.

```bash
gunzip mtg-cal-*.db.gz
file mtg-cal-*.db
# → "SQLite 3.x database, version XXX"
```

Retention is 30 days, GitHub auto-prunes older.

---

## Steady state — what you should see

**Every 15 minutes:**
- Railway Cron POSTs `/api/scrape-discord`. The fire-and-forget endpoint returns `202` immediately. Touches Discord guilds only (1-2 API calls per guild, ~seconds total) so newly-created scheduled events in connected Discords land in PlayIRL within minutes instead of waiting for the daily heavy scrape. Auths via the same `SCRAPE_SECRET`. Uses a separate in-process lock from the full scrape, so the two paths never block each other.

**Daily, in ascending UTC order:**
- `09:00` Railway Cron POSTs `/api/scrape`. The fire-and-forget endpoint returns `202` immediately. Scrape runs ~2–3 min on a warm geocode cache.
- `10:00` GitHub Actions `refresh.yml` runs `npm run fetch` with `MTG_SCRAPE_SCOPE=local`. Generates fresh `output/*.ics` files for the static GitHub-Pages-style feeds. Commits the ICS diffs only — does **not** touch the prod DB.
- `11:00` GitHub Actions `backup.yml` calls `/api/internal/integrity` (must return `ok: true`), then `/api/internal/backup`, uploads as a 30-day artifact.

**Per-week:**
- Dashboard at `/admin` shows "Last scrape" within the last 24h. If not, something's wrong with the cron — check Railway logs.
- "Geocode cache" stat hovers at ~3,000 entries. If it drops, the volume was reset or somebody truncated the table.

**Curation queue:**
- `/admin/events/pending` should be near-empty for `wizards-locator` and `topdeck` (auto-promoted). Discord events accumulate here for review.

---

## Failure modes & recovery

**Scrape fails partway through:**
- The per-region geocode cache + per-event id dedup means a re-run picks up where the previous one stopped, with zero wasted work. Just `npm run scrape:trigger` again.

**Volume gets reset / corrupted:**
- The backup workflow has 30 days of rolling artifacts. Download the most recent, `gunzip`, and copy onto the volume at `$DATABASE_PATH` while the service is stopped. The `lib/db.ts` seed-on-empty logic only fires when the file is missing entirely — so an existing-but-broken volume DB needs to be replaced manually before redeploy.

**Cron stops firing:**
- Hit `/api/health` from your laptop. If `eventCount` is current but `lastScrape` is days old, Railway Cron failed silently. Check the Railway Cron logs; re-arm if needed. As a fallback you can run `npm run scrape:trigger` manually any time.

**Integrity check fails (workflow goes red):**
- Don't ignore it. SQLite corruption on a Railway volume is rare but it does happen (disk pressure, partial writes). Pull the most recent good backup before the corruption, restore manually.

---

## Files added this round

- [cli/trigger-prod-scrape.ts](cli/trigger-prod-scrape.ts) — the post-deploy trigger helper invoked by `npm run scrape:trigger`
- [docs/PRODUCTION_FILL_RUNBOOK.md](docs/PRODUCTION_FILL_RUNBOOK.md) — this document
- [package.json](package.json) — added `scrape:trigger` script
