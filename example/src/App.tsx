import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

// ─── Shared visual language ─────────────────────────────────────────────
// Slack's own purple carries the "this belongs in Slack" identity; Convex's
// near-black + cream + terminal-window chrome carries the "built on Convex"
// identity. Nothing here is a third, invented palette.

const AVATAR_COLORS = ["#7c3aed", "#e0432b", "#f5a623", "#4a154b", "#2f9e6e", "#3b82c4"];

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsFor(seed: string): string {
  return seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

function formatSlackTs(ts?: string): string {
  if (!ts) return "";
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Slack sends reactions as bare shortcodes (`thumbsup`, `slightly_smiling_face`),
// never the glyph itself -- this is the same short-name -> emoji table Slack's
// own emoji picker is built from, trimmed to the reactions people actually use.
const EMOJI_SHORTCODES: Record<string, string> = {
  "+1": "👍", thumbsup: "👍", "-1": "👎", thumbsdown: "👎",
  smile: "😄", smiley: "😃", slightly_smiling_face: "🙂", grinning: "😀",
  laughing: "😆", joy: "😂", rofl: "🤣", wink: "😉", blush: "😊",
  sunglasses: "😎", thinking_face: "🤔", neutral_face: "😐", expressionless: "😑",
  confused: "😕", slightly_frowning_face: "🙁", disappointed: "😞", cry: "😢",
  sob: "😭", scream: "😱", angry: "😠", rage: "😡", exploding_head: "🤯",
  partying_face: "🥳", star_struck: "🤩", face_with_rolling_eyes: "🙄",
  raised_hands: "🙌", clap: "👏", pray: "🙏", muscle: "💪", ok_hand: "👌",
  wave: "👋", point_up: "☝️", eyes: "👀", heart: "❤️", heart_eyes: "😍",
  broken_heart: "💔", two_hearts: "💕", sparkling_heart: "💖",
  green_heart: "💚", blue_heart: "💙", yellow_heart: "💛", purple_heart: "💜",
  fire: "🔥", tada: "🎉", 100: "💯", sparkles: "✨", zap: "⚡", boom: "💥",
  rocket: "🚀", star: "⭐", star2: "🌟", bulb: "💡", gem: "💎",
  trophy: "🏆", medal: "🏅", first_place_medal: "🥇",
  white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌",
  warning: "⚠️", question: "❓", exclamation: "❗", no_entry: "⛔",
  eyes_closed: "🙈", see_no_evil: "🙈", speak_no_evil: "🙊", hear_no_evil: "🙉",
  skull: "💀", ghost: "👻", alien: "👽", robot_face: "🤖", poop: "💩",
  coffee: "☕", pizza: "🍕", beers: "🍻", tada2: "🎊",
  calendar: "📅", memo: "📝", pencil2: "✏️", mag: "🔍",
  lock: "🔒", unlock: "🔓", key: "🔑", gear: "⚙️", hammer_and_wrench: "🛠️",
  package: "📦", inbox_tray: "📥", outbox_tray: "📤", email: "📧",
  bell: "🔔", no_bell: "🔕", loud_sound: "🔊", speech_balloon: "💬",
  thought_balloon: "💭", red_circle: "🔴", large_blue_circle: "🔵",
  white_circle: "⚪", black_circle: "⚫", large_green_circle: "🟢",
  moneybag: "💰", dollar: "💵", chart_with_upwards_trend: "📈",
};

function emojiFor(shortcode: string): string {
  const base = shortcode.split("::")[0];
  return EMOJI_SHORTCODES[base] ?? `:${base}:`;
}

function Avatar({ seed, size = 28 }: { seed: string; size?: number }) {
  return (
    <div
      className="mono"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: 6,
        background: hashColor(seed),
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
      }}
    >
      {initialsFor(seed)}
    </div>
  );
}

// ─── Terminal-window chrome, Convex's own code-snippet motif ───────────────

function TerminalPanel({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-soft)",
          background: "var(--panel-bg-raised)",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "#e0432b" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "#f5a623" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "#2f9e6e" }} />
        <span
          className="mono"
          style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)", letterSpacing: 0.3 }}
        >
          {title}
        </span>
      </div>
      <div
        className="mono"
        style={{
          padding: "10px 14px",
          fontSize: 12.5,
          lineHeight: 1.9,
          color: empty ? "var(--text-faint)" : "var(--text)",
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Sidebar: workspace + channel switcher ─────────────────────────────────

function Sidebar({
  teamId,
  onSelectTeam,
  channelId,
  onSelectChannel,
}: {
  teamId: string;
  onSelectTeam: (id: string) => void;
  channelId: string;
  onSelectChannel: (id: string) => void;
}) {
  const installations = useQuery(api.example.listInstallations, {});
  const channels = useQuery(api.example.listChannels, teamId ? { teamId } : "skip");
  const authorizeUrl = useQuery(api.example.getAuthorizationUrl, {
    redirectUri: `${import.meta.env.VITE_CONVEX_SITE_URL}/slack/oauth/callback`,
  });
  const leaveChannel = useAction(api.example.leaveChannel);

  return (
    <div
      style={{
        width: 268,
        minWidth: 268,
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div style={{ padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>convex</span>
          <span style={{ color: "var(--text-faint)", fontSize: 15 }}>×</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--slack-purple-bright)" }}>slack</span>
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--gradient-stripe)", marginTop: 12 }} />
      </div>

      <div style={{ padding: "0 12px", flex: 1, overflowY: "auto" }}>
        <div
          style={{
            padding: "8px 8px 6px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--text-faint)",
          }}
        >
          Workspaces
        </div>

        {installations === undefined && (
          <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--text-muted)" }}>Loading…</div>
        )}
        {installations?.length === 0 && (
          <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            No workspace has installed this app yet.
          </div>
        )}
        {installations?.map((install) => {
          const active = teamId === install.teamId;
          return (
            <button
              key={install._id}
              onClick={() => onSelectTeam(install.teamId)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 8px",
                marginBottom: 2,
                border: "none",
                borderRadius: 6,
                background: active ? "var(--slack-purple)" : "transparent",
                color: active ? "#fff" : "var(--text)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Avatar seed={install.teamId} size={24} />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {install.teamName ?? install.teamId}
              </span>
              {install.uninstalledAt && (
                <span style={{ fontSize: 10, color: active ? "#e6d4e6" : "var(--text-faint)" }}>off</span>
              )}
            </button>
          );
        })}

        {teamId && (
          <>
            <div
              style={{
                padding: "16px 8px 6px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--text-faint)",
              }}
            >
              Channels
            </div>
            {channels?.length === 0 && (
              <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--text-muted)" }}>None synced yet.</div>
            )}
            {channels?.map((channel) => {
              const active = channelId === channel.channelId;
              return (
                <button
                  key={channel._id}
                  onClick={() => onSelectChannel(channel.channelId)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 8px",
                    marginBottom: 1,
                    border: "none",
                    borderRadius: 6,
                    background: active ? "var(--panel-bg-raised)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ color: "var(--text-faint)" }}>#</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {channel.name ?? channel.channelId}
                  </span>
                  {channel.botIsMember && (
                    <>
                      <span
                        role="button"
                        title="Leave this channel (conversations.leave) -- for testing member_left_channel"
                        onClick={(e) => {
                          e.stopPropagation();
                          void leaveChannel({ teamId, channelId: channel.channelId });
                        }}
                        style={{
                          fontSize: 10,
                          color: "var(--text-faint)",
                          marginRight: 4,
                          cursor: "pointer",
                        }}
                      >
                        leave
                      </span>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "#2f9e6e", flexShrink: 0 }} />
                    </>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>

      <div style={{ padding: 14, borderTop: "1px solid var(--border-soft)" }}>
        <a
          href={authorizeUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            background: "var(--convex-cream)",
            color: "var(--convex-black)",
            fontWeight: 700,
            fontSize: 13.5,
            borderRadius: 999,
            padding: "9px 0",
            textDecoration: "none",
          }}
        >
          + Add to Slack
        </a>
      </div>
    </div>
  );
}

// ─── Main panel: messages in the selected channel ──────────────────────────

function ReactionRow({ teamId, channelId, ts }: { teamId: string; channelId: string; ts: string }) {
  const reactions = useQuery(api.example.listReactions, { teamId, channelId, ts });
  if (!reactions || reactions.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
      {reactions
        .filter((r) => r.userIds.length > 0)
        .map((r) => (
          <span
            key={r._id}
            title={`:${r.reaction}:`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "var(--panel-bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "3px 9px 3px 7px",
              fontSize: 13,
              color: "var(--text-muted)",
              cursor: "default",
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>{emojiFor(r.reaction)}</span>
            <span className="mono" style={{ fontSize: 11.5 }}>
              {r.userIds.length}
            </span>
          </span>
        ))}
    </div>
  );
}

const TOOLBAR_ICONS: Array<{ label: string; glyph: React.ReactNode; style?: React.CSSProperties }> = [
  { label: "Bold", glyph: "B", style: { fontWeight: 800 } },
  { label: "Italic", glyph: "i", style: { fontStyle: "italic", fontWeight: 700 } },
  { label: "Strikethrough", glyph: "S", style: { textDecoration: "line-through", fontWeight: 700 } },
  { label: "Link", glyph: "🔗" },
];

function ToolbarButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "var(--text-muted)",
        fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = "var(--panel-bg-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function Composer({ teamId, channelId }: { teamId: string; channelId: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  const sendMessage = useAction(api.example.sendMessage);
  const uploadDemoFile = useAction(api.example.uploadDemoFile);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await sendMessage({ teamId, channel: channelId, text });
    setText("");
    setSending(false);
  };

  return (
    <div style={{ padding: "12px 28px 22px", borderTop: "1px solid var(--border-soft)" }}>
      <div
        style={{
          background: "var(--panel-bg)",
          border: `1.5px solid ${focused ? "var(--slack-purple-bright)" : "var(--border)"}`,
          borderRadius: 10,
          padding: "10px 12px 6px",
          transition: "border-color 120ms ease",
        }}
      >
        <textarea
          rows={1}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={`Message #${channelId}`}
          style={{
            width: "100%",
            resize: "none",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: 14.5,
            lineHeight: 1.5,
            fontFamily: "inherit",
            display: "block",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", marginTop: 4, paddingBottom: 2, gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flex: "1 1 auto",
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            {TOOLBAR_ICONS.map((icon) => (
              <ToolbarButton key={icon.label} title={icon.label}>
                <span style={icon.style}>{icon.glyph}</span>
              </ToolbarButton>
            ))}
            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolbarButton title="Emoji">🙂</ToolbarButton>
            <ToolbarButton
              title="Upload a test file (slack.uploadFile)"
              disabled={uploading}
              onClick={async () => {
                setUploading(true);
                await uploadDemoFile({ teamId, channelId });
                setUploading(false);
              }}
            >
              {uploading ? "…" : "📎"}
            </ToolbarButton>
          </div>
          <button
            disabled={!text.trim() || sending}
            onClick={submit}
            title="Send"
            style={{
              width: 30,
              height: 30,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: text.trim() ? "var(--slack-purple)" : "var(--panel-bg-raised)",
              color: text.trim() ? "#fff" : "var(--text-faint)",
              border: "none",
              borderRadius: 999,
              fontSize: 14,
              cursor: text.trim() ? "pointer" : "default",
              transition: "background 120ms ease",
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

function MessagesPanel({ teamId, channelId }: { teamId: string; channelId: string }) {
  const messages = useQuery(
    api.example.listMessages,
    teamId && channelId ? { teamId, channelId } : "skip",
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {messages?.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            No messages here yet — send one below, or post in Slack and watch it arrive live.
          </div>
        )}
        {messages?.map((message) => (
          <div key={message._id} style={{ display: "flex", gap: 12, marginBottom: 16, opacity: message.deletedAt ? 0.5 : 1 }}>
            <Avatar seed={message.isBotMessage ? message.botId ?? "bot" : message.userId ?? "?"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>
                  {message.isBotMessage ? "bot" : message.userId}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {formatSlackTs(message.ts)}
                </span>
                {message.editedAt && (
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>(edited)</span>
                )}
                {message.deletedAt && (
                  <span style={{ fontSize: 11, color: "var(--stripe-red)" }}>(deleted)</span>
                )}
              </div>
              <div style={{ fontSize: 14.5, color: "var(--text)", marginTop: 2, wordBreak: "break-word" }}>
                {message.deletedAt ? <em>message deleted</em> : message.text}
              </div>
              {!message.deletedAt && <ReactionRow teamId={teamId} channelId={channelId} ts={message.ts} />}
            </div>
          </div>
        ))}
      </div>

      <Composer teamId={teamId} channelId={channelId} />
    </div>
  );
}

// ─── Right rail: live component activity, Convex-flavored ─────────────────

function ActivityRail({ teamId }: { teamId: string }) {
  const stats = useQuery(api.example.getStats, {});
  const interactions = useQuery(api.example.listInteractions, teamId ? { teamId } : "skip");
  const commands = useQuery(api.example.listCommands, teamId ? { teamId } : "skip");

  return (
    <div
      style={{
        width: 300,
        minWidth: 240,
        flexShrink: 1,
        borderLeft: "1px solid var(--border)",
        background: "var(--convex-black-soft)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)", letterSpacing: 0.4, marginBottom: 8 }}>
          COMPONENT STATE
        </div>
        <div className="mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
          {[
            ["workspaces", stats?.installations],
            ["channels", stats?.channels],
            ["users", stats?.users],
            ["messages", stats?.messages],
            ["interactions", stats?.interactions],
            ["commands", stats?.commands],
          ].map(([label, value]) => (
            <div
              key={label as string}
              style={{
                background: "var(--panel-bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700 }}>{value ?? "–"}</div>
              <div style={{ color: "var(--text-faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)", letterSpacing: 0.4, marginBottom: 8 }}>
          INTERACTIVITY
        </div>
        <TerminalPanel title="interactivityHandler" empty={!interactions || interactions.length === 0}>
          {!teamId
            ? "$ select a workspace"
            : interactions?.length === 0
              ? "$ waiting for a button click, modal, or shortcut…"
              : interactions?.map((i) => (
                  <div key={i._id}>
                    <span style={{ color: "var(--stripe-orange)" }}>$</span> {i.type}
                    {i.actionId ? ` action_id=${i.actionId}` : ""}
                    {i.callbackId ? ` callback_id=${i.callbackId}` : ""} user={i.userId}
                  </div>
                ))}
        </TerminalPanel>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)", letterSpacing: 0.4, marginBottom: 8 }}>
          SLASH COMMANDS
        </div>
        <TerminalPanel title="commandsHandler" empty={!commands || commands.length === 0}>
          {!teamId
            ? "$ select a workspace"
            : commands?.length === 0
              ? "$ waiting for a slash command…"
              : commands?.map((c) => (
                  <div key={c._id}>
                    <span style={{ color: "var(--stripe-purple)" }}>$</span> {c.command} {c.text ?? ""}
                  </div>
                ))}
        </TerminalPanel>
      </div>
    </div>
  );
}

export default function App() {
  const [teamId, setTeamId] = useState("");
  const [channelId, setChannelId] = useState("");

  return (
    <div style={{ display: "flex", background: "var(--bg)", color: "var(--text)" }}>
      <Sidebar
        teamId={teamId}
        onSelectTeam={(id) => {
          setTeamId(id);
          setChannelId("");
        }}
        channelId={channelId}
        onSelectChannel={setChannelId}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100vh" }}>
        <div
          style={{
            padding: "16px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {channelId ? (
            <>
              <span style={{ fontSize: 16, fontWeight: 700 }}>#{channelId}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                team {teamId}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {teamId ? "Select a channel" : "Select a workspace to get started"}
            </span>
          )}
        </div>

        {teamId && channelId ? (
          <MessagesPanel teamId={teamId} channelId={channelId} />
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>

      <ActivityRail teamId={teamId} />
    </div>
  );
}
