import { describe, expect, test } from "vitest";
import { initConvexTest } from "./setup.test.js";
import { api } from "./_generated/api.js";

describe("installations", () => {
  test("upsertInstallation inserts then updates the same row on reinstall", async () => {
    const t = initConvexTest();

    const id = await t.mutation(api.lib.upsertInstallation, {
      teamId: "T1",
      appId: "A1",
      botUserId: "U_BOT",
      botToken: "xoxb-1",
      botScope: "chat:write",
      authedUserId: "U1",
    });

    let installation = await t.query(api.lib.getInstallation, { teamId: "T1" });
    expect(installation?._id).toBe(id);
    expect(installation?.botToken).toBe("xoxb-1");

    // A reinstall (e.g. granting a new scope) must patch the same row, not
    // create a second one, and must clear any prior uninstalledAt.
    await t.mutation(api.lib.markInstallationUninstalled, { teamId: "T1" });
    const secondId = await t.mutation(api.lib.upsertInstallation, {
      teamId: "T1",
      appId: "A1",
      botUserId: "U_BOT",
      botToken: "xoxb-2",
      botScope: "chat:write,channels:read",
      authedUserId: "U1",
    });

    expect(secondId).toBe(id);
    installation = await t.query(api.lib.getInstallation, { teamId: "T1" });
    expect(installation?.botToken).toBe("xoxb-2");
    expect(installation?.botScope).toBe("chat:write,channels:read");
    expect(installation?.uninstalledAt).toBeUndefined();

    const all = await t.query(api.lib.listInstallations, {});
    expect(all).toHaveLength(1);
  });

  test("patchInstallationToken updates only the token fields", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.upsertInstallation, {
      teamId: "T2",
      appId: "A1",
      botUserId: "U_BOT",
      botToken: "xoxb-old",
      botScope: "chat:write",
      authedUserId: "U1",
    });

    await t.mutation(api.lib.patchInstallationToken, {
      teamId: "T2",
      botToken: "xoxb-rotated",
      botRefreshToken: "refresh-1",
      botTokenExpiresAt: 123456,
    });

    const installation = await t.query(api.lib.getInstallation, { teamId: "T2" });
    expect(installation?.botToken).toBe("xoxb-rotated");
    expect(installation?.botRefreshToken).toBe("refresh-1");
    expect(installation?.botScope).toBe("chat:write");
  });
});

describe("messages", () => {
  test("recordMessage, patchMessageEdited, and markMessageDeleted keep history instead of overwriting blind", async () => {
    const t = initConvexTest();

    await t.mutation(api.lib.recordMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "111.000100",
      text: "hello",
      isBotMessage: false,
      userId: "U1",
    });

    await t.mutation(api.lib.patchMessageEdited, { teamId: "T1", channelId: "C1", ts: "111.000100", text: "hello!" });

    let message = await t.query(api.lib.getMessage, { teamId: "T1", channelId: "C1", ts: "111.000100" });
    expect(message?.text).toBe("hello!");
    expect(message?.editedAt).toBeDefined();
    expect(message?.deletedAt).toBeUndefined();

    await t.mutation(api.lib.markMessageDeleted, { teamId: "T1", channelId: "C1", ts: "111.000100" });
    message = await t.query(api.lib.getMessage, { teamId: "T1", channelId: "C1", ts: "111.000100" });
    expect(message?.deletedAt).toBeDefined();
    // The row is kept (not removed) so a UI can render "deleted" instead of
    // the message just vanishing.
    expect(message?.text).toBe("hello!");
  });

  test("listMessagesByThread only returns replies in that thread", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.recordMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "1.000",
      isBotMessage: false,
      text: "parent",
    });
    await t.mutation(api.lib.recordMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "2.000",
      threadTs: "1.000",
      isBotMessage: false,
      text: "reply one",
    });
    await t.mutation(api.lib.recordMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "3.000",
      isBotMessage: false,
      text: "unrelated top-level message",
    });

    const replies = await t.query(api.lib.listMessagesByThread, {
      teamId: "T1",
      channelId: "C1",
      threadTs: "1.000",
    });
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe("reply one");
  });
});

describe("reactions", () => {
  test("applyReactionDelta accumulates and removes users, and clears the row when empty", async () => {
    const t = initConvexTest();
    const args = { teamId: "T1", channelId: "C1", ts: "1.000", reaction: "thumbsup" };
    const messageArgs = { teamId: args.teamId, channelId: args.channelId, ts: args.ts };

    await t.mutation(api.lib.applyReactionDelta, { ...args, userId: "U1", added: true });
    await t.mutation(api.lib.applyReactionDelta, { ...args, userId: "U2", added: true });

    let reactions = await t.query(api.lib.listReactionsByMessage, messageArgs);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].userIds.sort()).toEqual(["U1", "U2"]);

    // Adding the same user twice must not duplicate them (Slack can, in
    // principle, redeliver the same reaction_added event).
    await t.mutation(api.lib.applyReactionDelta, { ...args, userId: "U1", added: true });
    reactions = await t.query(api.lib.listReactionsByMessage, messageArgs);
    expect(reactions[0].userIds).toHaveLength(2);

    await t.mutation(api.lib.applyReactionDelta, { ...args, userId: "U1", added: false });
    reactions = await t.query(api.lib.listReactionsByMessage, messageArgs);
    expect(reactions[0].userIds).toEqual(["U2"]);

    // Removing the last reactor should delete the row entirely, not leave
    // an empty-userIds row behind.
    await t.mutation(api.lib.applyReactionDelta, { ...args, userId: "U2", added: false });
    reactions = await t.query(api.lib.listReactionsByMessage, messageArgs);
    expect(reactions).toHaveLength(0);
  });

  test("removing a reaction that was never recorded is a no-op", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.applyReactionDelta, {
      teamId: "T1",
      channelId: "C1",
      ts: "1.000",
      reaction: "eyes",
      userId: "U1",
      added: false,
    });
    const reactions = await t.query(api.lib.listReactionsByMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "1.000",
    });
    expect(reactions).toHaveLength(0);
  });
});

describe("webhookEvents", () => {
  test("checkAndRecordEvent dedupes by eventId", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.lib.checkAndRecordEvent, {
      eventId: "Ev1",
      eventType: "message",
      teamId: "T1",
      payload: "{}",
    });
    expect(first.alreadyProcessed).toBe(false);

    const second = await t.mutation(api.lib.checkAndRecordEvent, {
      eventId: "Ev1",
      eventType: "message",
      teamId: "T1",
      payload: "{}",
    });
    expect(second.alreadyProcessed).toBe(true);

    const events = await t.query(api.lib.listRecentWebhookEvents, {});
    expect(events).toHaveLength(1);
  });
});

describe("scheduled messages", () => {
  test("recordScheduledMessage then patchScheduledMessageStatus", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.recordScheduledMessage, {
      teamId: "T1",
      channelId: "C1",
      scheduledMessageId: "Q123",
      postAt: 1234567890000,
      text: "reminder",
    });

    let list = await t.query(api.lib.listScheduledMessagesByTeam, { teamId: "T1" });
    expect(list[0].status).toBe("scheduled");

    await t.mutation(api.lib.patchScheduledMessageStatus, { scheduledMessageId: "Q123", status: "sent" });
    list = await t.query(api.lib.listScheduledMessagesByTeam, { teamId: "T1" });
    expect(list[0].status).toBe("sent");
  });
});

describe("stats", () => {
  test("getStats counts across tables", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.upsertInstallation, {
      teamId: "T1",
      appId: "A1",
      botUserId: "U_BOT",
      botToken: "xoxb-1",
      botScope: "chat:write",
      authedUserId: "U1",
    });
    await t.mutation(api.lib.recordMessage, {
      teamId: "T1",
      channelId: "C1",
      ts: "1.000",
      isBotMessage: true,
      text: "hi",
    });

    const stats = await t.query(api.lib.getStats, {});
    expect(stats.installations).toBe(1);
    expect(stats.messages).toBe(1);
  });
});
