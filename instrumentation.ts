export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("./lib/db");
    const db = getDb();

    const count = db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number };
    if (count.c === 0) {
      console.log("[startup] Empty database — auto-populating with events...");
      const { runScraper } = await import("./lib/scraper");
      runScraper("startup")
        .then((result) => console.log(`[startup] Done: ${result.added} events added`))
        .catch((err) => console.error("[startup] Scrape failed:", err.message));
    } else {
      console.log(`[startup] Database has ${count.c} events — skipping auto-scrape`);
    }
  }
}
