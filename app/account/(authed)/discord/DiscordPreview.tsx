"use client";

import { Fragment } from "react";

// Mirror of lib/discord-post.ts shapes — duplicated here so this client
// component doesn't drag the server-only helpers (and their bcrypt/sqlite
// transitive deps) into the browser bundle.
export interface PreviewEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  image?: { url: string };
}

export interface PreviewMessage {
  content?: string;
  embeds?: PreviewEmbed[];
}

interface Props {
  message: PreviewMessage;
  /** Bot identity at the top of the message — defaults match the live bot. */
  botName?: string;
  channelName?: string;
}

const DEFAULT_EMBED_COLOR = 0x4f46e5;

/**
 * Faithful-enough Discord chat preview for the digest renderer. Renders the
 * same JSON payload our dispatcher would POST to /channels/{id}/messages,
 * with markdown links, bold/italic, and `<t:UNIX:fmt>` timestamps resolved
 * to the viewer's local time. Not pixel-perfect Discord — close enough that
 * subscribers can verify their filters look right before going live.
 */
export default function DiscordPreview({
  message,
  botName = "PlayIRL.GG",
  channelName = "events",
}: Props) {
  const now = new Date();
  const timeLabel = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="rounded-md overflow-hidden border border-neutral-700 bg-[#313338] text-[#dbdee1] font-sans">
      {/* Channel header — mimics Discord's #channel-name pill at top */}
      <div className="px-4 py-2 border-b border-black/30 bg-[#2b2d31] flex items-center gap-2 text-[#f2f3f5]">
        <span className="text-[#80848e] text-base font-light">#</span>
        <span className="text-sm font-semibold">{channelName}</span>
        <span className="ml-auto text-[10px] text-[#80848e]">Preview</span>
      </div>

      {/* Message body */}
      <div className="px-4 py-3 flex gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-black flex items-center justify-center text-lg leading-none">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 leading-none">
            <span className="text-[#f2f3f5] text-base font-medium">{botName}</span>
            <span className="px-1 py-px rounded-sm text-[9px] font-bold bg-[#5865f2] text-white tracking-wide">APP</span>
            <span className="text-[11px] text-[#80848e]">Today at {timeLabel}</span>
          </div>

          {message.content && (
            <div className="mt-1 text-sm text-[#dbdee1] whitespace-pre-wrap break-words">
              <Markdown text={message.content} />
            </div>
          )}

          {message.embeds?.map((embed, i) => (
            <EmbedCard key={i} embed={embed} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmbedCard({ embed }: { embed: PreviewEmbed }) {
  const hex = colorIntToCss(embed.color ?? DEFAULT_EMBED_COLOR);

  return (
    <div className="mt-2 max-w-[520px] rounded-[4px] overflow-hidden flex bg-[#2b2d31]">
      <div className="w-1 shrink-0" style={{ backgroundColor: hex }} />
      <div className="px-4 py-3 flex-1 min-w-0 space-y-2">
        {embed.title && (
          <div className="text-sm font-semibold leading-snug">
            {embed.url ? (
              <a
                href={embed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00a8fc] hover:underline"
              >
                {embed.title}
              </a>
            ) : (
              <span className="text-[#f2f3f5]">{embed.title}</span>
            )}
          </div>
        )}

        {embed.description && (
          <DescriptionBody text={embed.description} />
        )}

        {embed.fields && embed.fields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2 pt-1">
            {embed.fields.map((f, i) => (
              <div key={i} className={f.inline ? "col-span-1" : "col-span-full"}>
                <div className="text-xs font-semibold text-[#f2f3f5]">
                  <Markdown text={f.name} />
                </div>
                <div className="text-sm text-[#dbdee1]">
                  <Markdown text={f.value} />
                </div>
              </div>
            ))}
          </div>
        )}

        {embed.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={embed.image.url}
            alt=""
            className="rounded-[3px] max-w-full mt-2"
            loading="lazy"
            decoding="async"
          />
        )}

        {embed.footer && (
          <div className="text-[11px] text-[#80848e] pt-1">{embed.footer.text}</div>
        )}
      </div>
    </div>
  );
}

// --- Description block rendering -------------------------------------------

// Splits the embed description by lines so block-level markdown (h1/h2/h3)
// gets element-level treatment instead of being inlined as plain text. Empty
// lines collapse to a small spacer rather than a full paragraph break — this
// matches Discord's own embed rendering, which is denser than chat content.
function DescriptionBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-sm text-[#dbdee1] leading-snug">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <div key={i} className="mt-3 mb-1 text-base font-bold text-[#f2f3f5]">
              <Markdown text={line.slice(4)} />
            </div>
          );
        }
        if (line.startsWith("## ")) {
          // Heavier weight + extra top margin so the day jumps out as a
          // section divider when scanning a multi-day digest.
          return (
            <div key={i} className="mt-4 mb-1 text-lg font-bold text-[#f2f3f5] tracking-tight">
              <Markdown text={line.slice(3)} />
            </div>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <div key={i} className="mt-4 mb-2 text-xl font-bold text-[#f2f3f5]">
              <Markdown text={line.slice(2)} />
            </div>
          );
        }
        if (line === "") return <div key={i} className="h-2" />;
        return (
          <div key={i} className="break-words">
            <Markdown text={line} />
          </div>
        );
      })}
    </div>
  );
}

// --- Markdown rendering -----------------------------------------------------

// Renders Discord's markdown subset (bold, italic, links, inline code) plus
// its dynamic timestamp tokens. Timestamps and links are tokenized first so
// their internals don't get re-parsed as bold or italic.
function Markdown({ text }: { text: string }) {
  return <>{renderInline(text)}</>;
}

type Token = { type: "text"; value: string } | { type: "node"; node: React.ReactNode };

function renderInline(text: string): React.ReactNode[] {
  // Token stream so we can layer transforms without re-tokenizing nested text.
  let tokens: Token[] = [{ type: "text", value: text }];

  tokens = applyRegex(tokens, /<t:(\d+)(?::([tTdDfFR]))?>/g, (m) => (
    <DiscordTimestamp key={`ts-${m.index}`} unix={Number(m[1])} fmt={(m[2] as TimestampFmt) || "f"} />
  ));

  // Bold-wrapped link: **[text](url)** — emit before plain link/bold so the
  // surrounding ** marks aren't left orphaned in adjacent text tokens after
  // the link regex consumes the inner [text](url).
  tokens = applyRegex(tokens, /\*\*\[([^\]]+)\]\(([^)\s]+)\)\*\*/g, (m) => (
    <a
      key={`ba-${m.index}`}
      href={m[2]}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#00a8fc] hover:underline"
    >
      {m[1]}
    </a>
  ));

  tokens = applyRegex(tokens, /\[([^\]]+)\]\(([^)\s]+)\)/g, (m) => (
    <a
      key={`a-${m.index}`}
      href={m[2]}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#00a8fc] hover:underline"
    >
      {m[1]}
    </a>
  ));

  tokens = applyRegex(tokens, /\*\*([^*]+)\*\*/g, (m) => (
    <strong key={`b-${m.index}`} className="font-semibold text-[#f2f3f5]">{m[1]}</strong>
  ));

  tokens = applyRegex(tokens, /(?:^|[^_])_([^_]+)_/g, (m) => {
    // Underscore-italic; consume the leading non-underscore char back into
    // the surrounding text so we don't lose it.
    const lead = m[0][0] === "_" ? "" : m[0][0];
    const node = <em key={`i-${m.index}`} className="italic">{m[1]}</em>;
    return lead ? (
      <Fragment key={`if-${m.index}`}>{lead}{node}</Fragment>
    ) : node;
  });

  tokens = applyRegex(tokens, /`([^`]+)`/g, (m) => (
    <code key={`c-${m.index}`} className="px-1 py-0.5 rounded bg-black/40 text-[12px] font-mono">{m[1]}</code>
  ));

  return tokens.map((t, i) =>
    t.type === "text" ? <Fragment key={`t-${i}`}>{t.value}</Fragment> : <Fragment key={`n-${i}`}>{t.node}</Fragment>
  );
}

function applyRegex(
  tokens: Token[],
  re: RegExp,
  toNode: (match: RegExpExecArray) => React.ReactNode,
): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    if (tok.type !== "text") {
      out.push(tok);
      continue;
    }
    let lastIdx = 0;
    const text = tok.value;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) {
        out.push({ type: "text", value: text.slice(lastIdx, m.index) });
      }
      out.push({ type: "node", node: toNode(m) });
      lastIdx = m.index + m[0].length;
      // Guard against zero-length matches infinite-looping
      if (m[0].length === 0) re.lastIndex++;
    }
    if (lastIdx < text.length) {
      out.push({ type: "text", value: text.slice(lastIdx) });
    }
  }
  return out;
}

// --- Discord <t:UNIX:fmt> timestamp ----------------------------------------

type TimestampFmt = "t" | "T" | "d" | "D" | "f" | "F" | "R";

function DiscordTimestamp({ unix, fmt }: { unix: number; fmt: TimestampFmt }) {
  // Discord's hover tooltip shows the same time in fmt 'F'. We omit the
  // tooltip but keep the bg highlight so it's visually identifiable as a
  // dynamic timestamp.
  return (
    <span className="px-1 py-px rounded bg-[#3f4147] text-[#dbdee1] text-[13px]">
      {formatTimestamp(unix, fmt)}
    </span>
  );
}

function formatTimestamp(unix: number, fmt: TimestampFmt): string {
  const d = new Date(unix * 1000);
  switch (fmt) {
    case "t": return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    case "T": return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    case "d": return d.toLocaleDateString("en-US");
    case "D": return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    case "f": return d.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    case "F": return d.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    case "R": return relativeTime(d);
  }
}

function relativeTime(d: Date): string {
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

function colorIntToCss(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}
