// Small wrapper around Discord's REST API for the MTG Cal bot itself
// (as opposed to per-user OAuth calls).

const DISCORD_API = "https://discord.com/api/v10";

export interface BotGuild {
  id: string;
  name: string;
  icon: string | null;
}

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN || null;
}

export function botClientId(): string | null {
  return process.env.DISCORD_BOT_CLIENT_ID || null;
}

// Permission bitfield for the invite URL. Discord docs:
// https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
//   VIEW_CHANNEL          0x000000400 — see channels the bot is allowed in
//   SEND_MESSAGES         0x000000800 — post digests / reminders
//   EMBED_LINKS           0x000004000 — render rich embeds (the entire UX)
//   READ_MESSAGE_HISTORY  0x000010000 — required to PATCH our own messages on cancellation (v2)
//   MANAGE_EVENTS         0x200000000 — create/update Discord scheduled events from the
//                                       host's PlayIRL event detail page (Events-tab feature).
// Sum = 0x200014C00 = 8590019584. Hex literal works fine as a Number —
// the value is well under Number.MAX_SAFE_INTEGER (2^53).
const BOT_PERMISSIONS = String(0x200014C00);

export function botInviteUrl(state?: string): string | null {
  const id = botClientId();
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSIONS,
  });
  if (state) params.set("state", state);
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export interface BotChannel {
  id: string;
  name: string;
  /** Discord channel type: 0=text, 5=announcement (we only care about postable text). */
  type: number;
  position: number;
  parent_id: string | null;
}

/**
 * Channels in a guild the bot can see. Used by the web "Add subscription"
 * flow to populate the channel dropdown. Filters to type 0 (GUILD_TEXT) and
 * type 5 (GUILD_ANNOUNCEMENT) — both accept message posts via the same
 * REST endpoint. Voice/forum/category channels are dropped.
 */
export async function listGuildTextChannels(guildId: string): Promise<BotChannel[]> {
  const token = botToken();
  if (!token) return [];
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord /guilds/${guildId}/channels failed: ${res.status} ${body}`);
  }
  const channels = await res.json() as BotChannel[];
  return channels
    .filter(c => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position);
}

/** Returns every guild the bot is currently a member of (paginated). */
export async function listBotGuilds(): Promise<BotGuild[]> {
  const token = botToken();
  if (!token) return [];
  const out: BotGuild[] = [];
  let after: string | undefined;
  // Discord paginates at 200 guilds max per page.
  for (let i = 0; i < 10; i++) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` }, cache: "no-store" });
    if (!res.ok) break;
    const page = (await res.json()) as BotGuild[];
    out.push(...page);
    if (page.length < 200) break;
    after = page[page.length - 1].id;
  }
  return out;
}
