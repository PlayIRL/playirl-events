// One-shot script: registers the /playirl slash commands with Discord.
//
// Usage:
//   npm run discord:register
//
// Required env:
//   DISCORD_BOT_TOKEN       — bot token (same token the scraper uses)
//   DISCORD_BOT_CLIENT_ID   — application ID (Discord Developer Portal)
//
// Optional env:
//   DISCORD_REGISTER_GUILD_ID — register as a guild-only command (instant
//     propagation; useful for testing). If unset, commands register globally
//     (can take up to an hour to propagate the first time).

import dotenv from "dotenv";
// Load .env first, then let .env.local override (Next.js convention).
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const DISCORD_API = "https://discord.com/api/v10";

// Option types — see https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type
const OPT_SUB_COMMAND = 1;
const OPT_STRING = 3;
const OPT_INTEGER = 4;

type Choice = { name: string; value: string | number };

type Option = {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: Choice[];
  options?: Option[];
  min_value?: number;
  max_value?: number;
  autocomplete?: boolean;
};

const FORMAT_CHOICES: Choice[] = [
  { name: "Commander", value: "Commander" },
  { name: "Modern", value: "Modern" },
  { name: "Standard", value: "Standard" },
  { name: "Pioneer", value: "Pioneer" },
  { name: "Legacy", value: "Legacy" },
  { name: "Pauper", value: "Pauper" },
  { name: "Draft", value: "Draft" },
  { name: "Sealed", value: "Sealed" },
];

const RADIUS_CHOICES: Choice[] = [
  { name: "5 miles", value: 5 },
  { name: "10 miles", value: 10 },
  { name: "25 miles", value: 25 },
  { name: "50 miles", value: 50 },
  { name: "100 miles", value: 100 },
];

const lookupOptions: Option[] = [
  {
    type: OPT_STRING,
    name: "format",
    description: "Optional — only show events for this format (e.g. Commander, Modern). Leave blank for any.",
    choices: FORMAT_CHOICES,
  },
  {
    type: OPT_STRING,
    name: "location",
    description: "Required — your ZIP code, city, or address (e.g. 19103 or 'Philadelphia, PA').",
    required: true,
  },
  {
    type: OPT_INTEGER,
    name: "radius_miles",
    description: "Required — how far from your location to search.",
    required: true,
    choices: RADIUS_CHOICES,
  },
];

const playirlCommand = {
  name: "playirl",
  description: "PlayIRL.GG event lookups and subscriptions.",
  // No default_member_permissions: today/week/help are public, and Discord
  // doesn't support per-subcommand permission gates. The handler enforces
  // Manage Server on list/preview/unsubscribe and politely refuses non-admins.
  // Visibility-as-discoverability is the trade.
  options: [
    // -- Public lookup commands (no Manage Server needed) --
    {
      type: OPT_SUB_COMMAND,
      name: "today",
      description: "Find MTG events happening today near you (requires location + radius).",
      options: lookupOptions,
    },
    {
      type: OPT_SUB_COMMAND,
      name: "week",
      description: "Find MTG events in the next 7 days near you (requires location + radius).",
      options: lookupOptions,
    },
    {
      type: OPT_SUB_COMMAND,
      name: "help",
      description: "Quick reference for all /playirl commands and how to use them.",
    },
    // -- Admin (Manage Server) commands --
    {
      type: OPT_SUB_COMMAND,
      name: "unsubscribe",
      description: "Stop a recurring event post in this server.",
      options: [
        {
          type: OPT_STRING,
          name: "id",
          description: "Pick the subscription to disable (start typing — Discord will autocomplete).",
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],
};

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_BOT_CLIENT_ID;
  const guildId = process.env.DISCORD_REGISTER_GUILD_ID;

  if (!token) throw new Error("DISCORD_BOT_TOKEN is required");
  if (!appId) throw new Error("DISCORD_BOT_CLIENT_ID is required");

  const path = guildId
    ? `/applications/${appId}/guilds/${guildId}/commands`
    : `/applications/${appId}/commands`;

  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([playirlCommand]),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`[register] HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  const scope = guildId ? `guild ${guildId}` : "global";
  console.log(`[register] /playirl registered (${scope}).`);
  console.log(body);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
