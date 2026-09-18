import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../src/component/schema.js";
import { api } from "./_generated/api.js";

// Fixed so every test signs against the same values example/convex/http.ts
// picks up from process.env at import time (before this file ever calls
// initConvexTest / t.fetch, which is what triggers that module's first,
// lazy import).
const SIGNING_SECRET = "test-signing-secret";
process.env.SLACK_CLIENT_ID = "test-client-id";
process.env.SLACK_CLIENT_SECRET = "test-client-secret";
process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;

const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");

function initConvexTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("convexSlack", schema, componentModules);
  return t;
}

// ─── An independent re-implementation of Slack's request signature ────────
// Deliberately not imported from src/client/index.ts: this is a from-scratch
// HMAC-SHA256 signer so the test actually exercises the handler's
// verification against a signature it didn't produce itself, the same way
// Slack's own servers sign every Events API / Interactivity / Slash Command
// delivery. See https://docs.slack.dev/authentication/verifying-requests-from-slack/.

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signSlackRequest(secret: string, timestamp: string, rawBody: string): Promise<string> {
  return `v0=${await hmacSha256Hex(secret, `v0:${timestamp}:${rawBody}`)}`;
}

async function postSigned(
  t: TestConvex<typeof schema>,
  path: string,
  rawBody: string,
  opts: { timestamp?: string; signature?: string; secret?: string; noHeaders?: boolean } = {},
) {
  if (opts.noHeaders) {
    return t.fetch(path, { method: "POST", body: rawBody });
  }
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = opts.signature ?? (await signSlackRequest(opts.secret ?? SIGNING_SECRET, timestamp, rawBody));
  return t.fetch(path, {
    method: "POST",
    headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature },
    body: rawBody,
  });
}

function eventCallback(eventId: string, event: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ type: "event_callback", event_id: eventId, team_id: "T1", event, ...extra });
}

function interactivityBody(payload: Record<string, unknown>) {
  return `payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

function commandBody(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString();
}

describe("eventsHandler: signature verification", () => {
  test("rejects a request with no signature headers", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/events", eventCallback("evt_1", { type: "message" }), {
      noHeaders: true,
    });
    expect(res.status).toBe(400);
  });

  test("rejects a request signed with the wrong secret", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/events", eventCallback("evt_1", { type: "message" }), {
      secret: "wrong-secret",
    });
    expect(res.status).toBe(401);
  });

  test("rejects a timestamp more than 5 minutes old", async () => {
    const t = initConvexTest();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const res = await postSigned(t, "/slack/events", eventCallback("evt_1", { type: "message" }), {
      timestamp: staleTimestamp,
    });
    expect(res.status).toBe(401);
  });

  test("rejects a body that doesn't match what was signed", async () => {
    const t = initConvexTest();
    const signedFor = eventCallback("evt_1", { type: "message", text: "original" });
    const actuallySent = eventCallback("evt_1", { type: "message", text: "swapped" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signSlackRequest(SIGNING_SECRET, timestamp, signedFor);
    const res = await t.fetch("/slack/events", {
      method: "POST",
      headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature },
      body: actuallySent,
    });
    expect(res.status).toBe(401);
  });
});

describe("eventsHandler: URL verification handshake", () => {
  test("echoes the challenge back before any signature-independent logic runs", async () => {
    const t = initConvexTest();
    const body = JSON.stringify({ type: "url_verification", challenge: "abc123" });
    const res = await postSigned(t, "/slack/events", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "abc123" });
  });
});

describe("eventsHandler: event dedup", () => {
  test("a retried delivery with the same event_id is reported as duplicate and not reprocessed", async () => {
    const t = initConvexTest();
    const body = eventCallback("evt_dup", {
      type: "message",
      channel: "C1",
      ts: "100.000100",
      user: "U1",
      text: "hello",
    });

    const first = await postSigned(t, "/slack/events", body);
    expect(first.status).toBe(200);
    expect((await first.json()).duplicate).toBeUndefined();

    const second = await postSigned(t, "/slack/events", body);
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);

    const messages = await t.query(api.example.listMessages, { teamId: "T1", channelId: "C1" });
    expect(messages).toHaveLength(1);
  });
});

describe("eventsHandler: message lifecycle", () => {
  test("records a new message, then applies message_changed and message_deleted to it", async () => {
    const t = initConvexTest();

    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_msg_new", { type: "message", channel: "C1", ts: "200.000100", user: "U1", text: "original" }),
    );
    let messages = await t.query(api.example.listMessages, { teamId: "T1", channelId: "C1" });
    expect(messages.find((m) => m.ts === "200.000100")?.text).toBe("original");

    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_msg_edit", {
        type: "message",
        subtype: "message_changed",
        channel: "C1",
        message: { ts: "200.000100", text: "edited" },
      }),
    );
    messages = await t.query(api.example.listMessages, { teamId: "T1", channelId: "C1" });
    const edited = messages.find((m) => m.ts === "200.000100");
    expect(edited?.text).toBe("edited");
    expect(edited?.editedAt).toBeDefined();

    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_msg_del", {
        type: "message",
        subtype: "message_deleted",
        channel: "C1",
        deleted_ts: "200.000100",
      }),
    );
    messages = await t.query(api.example.listMessages, { teamId: "T1", channelId: "C1" });
    expect(messages.find((m) => m.ts === "200.000100")?.deletedAt).toBeDefined();
  });
});

describe("eventsHandler: reactions", () => {
  test("reaction_added records the reactor, reaction_removed takes them back off", async () => {
    const t = initConvexTest();

    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_react_add", {
        type: "reaction_added",
        user: "U1",
        reaction: "thumbsup",
        item: { type: "message", channel: "C1", ts: "300.000100" },
      }),
    );
    let reactions = await t.query(api.example.listReactions, { teamId: "T1", channelId: "C1", ts: "300.000100" });
    expect(reactions.find((r) => r.reaction === "thumbsup")?.userIds).toContain("U1");

    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_react_remove", {
        type: "reaction_removed",
        user: "U1",
        reaction: "thumbsup",
        item: { type: "message", channel: "C1", ts: "300.000100" },
      }),
    );
    reactions = await t.query(api.example.listReactions, { teamId: "T1", channelId: "C1", ts: "300.000100" });
    expect(reactions.find((r) => r.reaction === "thumbsup")?.userIds ?? []).not.toContain("U1");
  });
});

describe("eventsHandler: channels", () => {
  test("channel_created records the channel", async () => {
    const t = initConvexTest();
    await postSigned(
      t,
      "/slack/events",
      eventCallback("evt_chan", { type: "channel_created", channel: { id: "C2", name: "general", is_private: false } }),
    );
    const channels = await t.query(api.example.listChannels, { teamId: "T1" });
    expect(channels.find((c) => c.channelId === "C2")?.name).toBe("general");
  });

  test("member_joined_channel only sets botIsMember when the bot itself joined", async () => {
    const t = initConvexTest();
    await postSigned(
      t,
      "/slack/events",
      eventCallback(
        "evt_join_other",
        { type: "member_joined_channel", channel: "C3", user: "U_other" },
        { authorizations: [{ user_id: "BOT1" }] },
      ),
    );
    let channels = await t.query(api.example.listChannels, { teamId: "T1" });
    expect(channels.find((c) => c.channelId === "C3")).toBeUndefined();

    await postSigned(
      t,
      "/slack/events",
      eventCallback(
        "evt_join_bot",
        { type: "member_joined_channel", channel: "C3", user: "BOT1" },
        { authorizations: [{ user_id: "BOT1" }] },
      ),
    );
    channels = await t.query(api.example.listChannels, { teamId: "T1" });
    expect(channels.find((c) => c.channelId === "C3")?.botIsMember).toBe(true);
  });
});

describe("interactivityHandler", () => {
  test("rejects an unsigned request", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/interactivity", interactivityBody({ type: "block_actions" }), {
      noHeaders: true,
    });
    expect(res.status).toBe(400);
  });

  test("rejects a request signed with the wrong secret", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/interactivity", interactivityBody({ type: "block_actions" }), {
      secret: "wrong-secret",
    });
    expect(res.status).toBe(401);
  });

  test("logs a block_actions payload with its action_id and acks with an empty body", async () => {
    const t = initConvexTest();
    const body = interactivityBody({
      type: "block_actions",
      team: { id: "T1" },
      user: { id: "U1" },
      actions: [{ action_id: "approve" }],
      trigger_id: "trig_1",
    });
    const res = await postSigned(t, "/slack/interactivity", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});

    const interactions = await t.query(api.example.listInteractions, { teamId: "T1" });
    expect(interactions[0].type).toBe("block_actions");
    expect(interactions[0].actionId).toBe("approve");
  });

  test("logs a view_submission payload with the modal's callback_id", async () => {
    const t = initConvexTest();
    const body = interactivityBody({
      type: "view_submission",
      team: { id: "T1" },
      user: { id: "U1" },
      view: { callback_id: "invoice_modal" },
    });
    await postSigned(t, "/slack/interactivity", body);

    const interactions = await t.query(api.example.listInteractions, { teamId: "T1" });
    expect(interactions[0].type).toBe("view_submission");
    expect(interactions[0].callbackId).toBe("invoice_modal");
  });

  test("logs a global shortcut invocation", async () => {
    const t = initConvexTest();
    const body = interactivityBody({
      type: "shortcut",
      team: { id: "T1" },
      user: { id: "U1" },
      callback_id: "open_invoice",
      trigger_id: "trig_2",
    });
    await postSigned(t, "/slack/interactivity", body);

    const interactions = await t.query(api.example.listInteractions, { teamId: "T1" });
    expect(interactions[0].type).toBe("shortcut");
    expect(interactions[0].callbackId).toBe("open_invoice");
    expect(interactions[0].triggerId).toBe("trig_2");
  });
});

describe("commandsHandler", () => {
  test("rejects an unsigned request", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/commands", commandBody({ team_id: "T1", user_id: "U1", command: "/invoice" }), {
      noHeaders: true,
    });
    expect(res.status).toBe(400);
  });

  test("rejects a malformed payload missing the command", async () => {
    const t = initConvexTest();
    const res = await postSigned(t, "/slack/commands", commandBody({ team_id: "T1", user_id: "U1" }));
    expect(res.status).toBe(400);
  });

  test("records a slash command invocation", async () => {
    const t = initConvexTest();
    const body = commandBody({
      team_id: "T1",
      user_id: "U1",
      command: "/invoice",
      text: "amount 100",
      channel_id: "C1",
      trigger_id: "trig_3",
      response_url: "https://hooks.slack.com/commands/T1/xxx",
    });
    const res = await postSigned(t, "/slack/commands", body);
    expect(res.status).toBe(200);

    const commands = await t.query(api.example.listCommands, { teamId: "T1" });
    expect(commands[0].command).toBe("/invoice");
    expect(commands[0].text).toBe("amount 100");
    expect(commands[0].triggerId).toBe("trig_3");
  });
});
