import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

const panelStyle: React.CSSProperties = {
  background: "#181a20",
  border: "1px solid #2a2d36",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  background: "#0f1115",
  border: "1px solid #2a2d36",
  borderRadius: 6,
  color: "#e6e6e6",
  padding: "6px 10px",
  marginRight: 8,
};

const buttonStyle: React.CSSProperties = {
  background: "#4a154b",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "6px 14px",
  cursor: "pointer",
};

function InstallationsPanel({ teamId, onSelectTeam }: { teamId: string; onSelectTeam: (id: string) => void }) {
  const installations = useQuery(api.example.listInstallations, {});
  return (
    <div style={panelStyle}>
      <h2>Workspaces</h2>
      {installations === undefined && <p>Loading…</p>}
      {installations?.length === 0 && (
        <p>
          No workspace has installed this app yet. Wire up an "Add to Slack" button using{" "}
          <code>getAuthorizationUrl</code>.
        </p>
      )}
      <ul>
        {installations?.map((install) => (
          <li key={install._id}>
            <button
              style={{ ...buttonStyle, background: teamId === install.teamId ? "#4a154b" : "#2a2d36" }}
              onClick={() => onSelectTeam(install.teamId)}
            >
              {install.teamName ?? install.teamId}
            </button>{" "}
            {install.uninstalledAt ? "(uninstalled)" : "(active)"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelsAndMessagesPanel({ teamId }: { teamId: string }) {
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const channels = useQuery(api.example.listChannels, teamId ? { teamId } : "skip");
  const messages = useQuery(
    api.example.listMessages,
    teamId && channelId ? { teamId, channelId } : "skip",
  );
  const sendMessage = useAction(api.example.sendMessage);

  return (
    <div style={panelStyle}>
      <h2>Channels &amp; messages</h2>
      {!teamId && <p>Select a workspace above first.</p>}
      {teamId && (
        <>
          <div style={{ marginBottom: 12 }}>
            {channels?.map((channel) => (
              <button
                key={channel._id}
                style={{ ...buttonStyle, background: channelId === channel.channelId ? "#4a154b" : "#2a2d36", marginRight: 8 }}
                onClick={() => setChannelId(channel.channelId)}
              >
                #{channel.name ?? channel.channelId}
              </button>
            ))}
          </div>
          {channelId && (
            <>
              <ul>
                {messages?.map((message) => (
                  <li key={message._id}>
                    <strong>{message.isBotMessage ? "bot" : message.userId}</strong>: {message.text}
                    {message.deletedAt && " (deleted)"}
                    {message.editedAt && " (edited)"}
                  </li>
                ))}
              </ul>
              <input
                style={inputStyle}
                placeholder="Message text"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                style={buttonStyle}
                onClick={async () => {
                  if (!text) return;
                  await sendMessage({ teamId, channel: channelId, text });
                  setText("");
                }}
              >
                Send
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function InteractionsPanel({ teamId }: { teamId: string }) {
  const interactions = useQuery(api.example.listInteractions, teamId ? { teamId } : "skip");
  return (
    <div style={panelStyle}>
      <h2>Interactions</h2>
      {!teamId && <p>Select a workspace above first.</p>}
      <ul>
        {interactions?.map((interaction) => (
          <li key={interaction._id}>
            <strong>{interaction.type}</strong> from {interaction.userId}
            {interaction.actionId && ` — ${interaction.actionId}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsPanel() {
  const stats = useQuery(api.example.getStats, {});
  if (!stats) return null;
  return (
    <div style={panelStyle}>
      <h2>Stats</h2>
      <p>
        {stats.installations} workspaces · {stats.channels} channels · {stats.users} users ·{" "}
        {stats.messages} messages · {stats.interactions} interactions · {stats.commands} commands ·{" "}
        {stats.files} files
      </p>
    </div>
  );
}

export default function App() {
  const [teamId, setTeamId] = useState("");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>convex-slack example</h1>
      <StatsPanel />
      <InstallationsPanel teamId={teamId} onSelectTeam={setTeamId} />
      <ChannelsAndMessagesPanel teamId={teamId} />
      <InteractionsPanel teamId={teamId} />
    </div>
  );
}
