import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

const installationValidator = v.object({
  _id: v.id("installations"),
  _creationTime: v.number(),
  teamId: v.string(),
  teamName: v.optional(v.string()),
  enterpriseId: v.optional(v.string()),
  appId: v.string(),
  botUserId: v.string(),
  botToken: v.string(),
  botScope: v.string(),
  botRefreshToken: v.optional(v.string()),
  botTokenExpiresAt: v.optional(v.number()),
  authedUserId: v.string(),
  incomingWebhookUrl: v.optional(v.string()),
  incomingWebhookChannel: v.optional(v.string()),
  incomingWebhookChannelId: v.optional(v.string()),
  installedAt: v.number(),
  updatedAt: v.number(),
  uninstalledAt: v.optional(v.number()),
});

const channelValidator = v.object({
  _id: v.id("channels"),
  _creationTime: v.number(),
  teamId: v.string(),
  channelId: v.string(),
  name: v.optional(v.string()),
  isPrivate: v.optional(v.boolean()),
  isIm: v.optional(v.boolean()),
  isMpim: v.optional(v.boolean()),
  isArchived: v.optional(v.boolean()),
  topic: v.optional(v.string()),
  purpose: v.optional(v.string()),
  botIsMember: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  teamId: v.string(),
  userId: v.string(),
  name: v.optional(v.string()),
  realName: v.optional(v.string()),
  displayName: v.optional(v.string()),
  email: v.optional(v.string()),
  isBot: v.optional(v.boolean()),
  isAdmin: v.optional(v.boolean()),
  deleted: v.optional(v.boolean()),
  updatedAt: v.number(),
});

const messageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  teamId: v.string(),
  channelId: v.string(),
  ts: v.string(),
  threadTs: v.optional(v.string()),
  userId: v.optional(v.string()),
  botId: v.optional(v.string()),
  text: v.optional(v.string()),
  isBotMessage: v.boolean(),
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const reactionValidator = v.object({
  _id: v.id("reactions"),
  _creationTime: v.number(),
  teamId: v.string(),
  channelId: v.string(),
  ts: v.string(),
  reaction: v.string(),
  userIds: v.array(v.string()),
  updatedAt: v.number(),
});

const interactionTypeValidator = v.union(
  v.literal("block_actions"),
  v.literal("view_submission"),
  v.literal("view_closed"),
  v.literal("shortcut"),
  v.literal("message_action"),
);

const interactionValidator = v.object({
  _id: v.id("interactions"),
  _creationTime: v.number(),
  teamId: v.string(),
  userId: v.string(),
  type: interactionTypeValidator,
  actionId: v.optional(v.string()),
  callbackId: v.optional(v.string()),
  triggerId: v.optional(v.string()),
  payload: v.string(),
  receivedAt: v.number(),
});

const commandValidator = v.object({
  _id: v.id("commands"),
  _creationTime: v.number(),
  teamId: v.string(),
  userId: v.string(),
  command: v.string(),
  text: v.optional(v.string()),
  channelId: v.optional(v.string()),
  triggerId: v.optional(v.string()),
  responseUrl: v.optional(v.string()),
  receivedAt: v.number(),
});

const fileValidator = v.object({
  _id: v.id("files"),
  _creationTime: v.number(),
  teamId: v.string(),
  fileId: v.string(),
  name: v.optional(v.string()),
  title: v.optional(v.string()),
  mimetype: v.optional(v.string()),
  size: v.optional(v.number()),
  url: v.optional(v.string()),
  permalink: v.optional(v.string()),
  channelId: v.optional(v.string()),
  ts: v.optional(v.string()),
  uploadedAt: v.number(),
});

const scheduledMessageStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("sent"),
  v.literal("deleted"),
);

const scheduledMessageValidator = v.object({
  _id: v.id("scheduledMessages"),
  _creationTime: v.number(),
  teamId: v.string(),
  channelId: v.string(),
  scheduledMessageId: v.string(),
  postAt: v.number(),
  text: v.optional(v.string()),
  status: scheduledMessageStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

const webhookEventValidator = v.object({
  _id: v.id("webhookEvents"),
  _creationTime: v.number(),
  eventId: v.string(),
  eventType: v.string(),
  teamId: v.optional(v.string()),
  payload: v.string(),
  receivedAt: v.number(),
});

// ---------------------------------------------------------------------------
// Installations
// ---------------------------------------------------------------------------

export const getInstallation = query({
  args: { teamId: v.string() },
  returns: v.union(installationValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("installations")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
  },
});

export const listInstallations = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(installationValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("installations")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// Upsert-by-teamId: the OAuth callback calls this on every install *and*
// every reinstall/rescope, so a workspace clicking "Add to Slack" a second
// time (e.g. to grant a new scope) updates the same row instead of creating
// a duplicate -- same idempotent-seed posture as this campaign app's own
// seed.ts, applied here to a live OAuth callback instead of a script.
export const upsertInstallation = mutation({
  args: {
    teamId: v.string(),
    teamName: v.optional(v.string()),
    enterpriseId: v.optional(v.string()),
    appId: v.string(),
    botUserId: v.string(),
    botToken: v.string(),
    botScope: v.string(),
    botRefreshToken: v.optional(v.string()),
    botTokenExpiresAt: v.optional(v.number()),
    authedUserId: v.string(),
    incomingWebhookUrl: v.optional(v.string()),
    incomingWebhookChannel: v.optional(v.string()),
    incomingWebhookChannelId: v.optional(v.string()),
  },
  returns: v.id("installations"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("installations")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now, uninstalledAt: undefined });
      return existing._id;
    }
    return await ctx.db.insert("installations", { ...args, installedAt: now, updatedAt: now });
  },
});

export const patchInstallationToken = mutation({
  args: {
    teamId: v.string(),
    botToken: v.string(),
    botRefreshToken: v.optional(v.string()),
    botTokenExpiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("installations")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      botToken: args.botToken,
      botRefreshToken: args.botRefreshToken,
      botTokenExpiresAt: args.botTokenExpiresAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markInstallationUninstalled = mutation({
  args: { teamId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("installations")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { uninstalledAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const getChannel = query({
  args: { teamId: v.string(), channelId: v.string() },
  returns: v.union(channelValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_team_and_channel", (q) => q.eq("teamId", args.teamId).eq("channelId", args.channelId))
      .unique();
  },
});

export const listChannels = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(channelValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});

export const upsertChannel = mutation({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    name: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    isIm: v.optional(v.boolean()),
    isMpim: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    topic: v.optional(v.string()),
    purpose: v.optional(v.string()),
    botIsMember: v.optional(v.boolean()),
  },
  returns: v.id("channels"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_team_and_channel", (q) => q.eq("teamId", args.teamId).eq("channelId", args.channelId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("channels", { ...args, createdAt: now, updatedAt: now });
  },
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const getUser = query({
  args: { teamId: v.string(), userId: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_team_and_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .unique();
  },
});

export const listUsers = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(userValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_team_and_user", (q) => q.eq("teamId", args.teamId))
      .take(args.limit ?? 200);
  },
});

export const upsertUser = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    name: v.optional(v.string()),
    realName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    isBot: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    deleted: v.optional(v.boolean()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_team_and_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("users", { ...args, updatedAt: now });
  },
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const getMessage = query({
  args: { teamId: v.string(), channelId: v.string(), ts: v.string() },
  returns: v.union(messageValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_team_channel_and_ts", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts),
      )
      .unique();
  },
});

export const listMessagesByChannel = query({
  args: { teamId: v.string(), channelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(messageValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_team_and_channel", (q) => q.eq("teamId", args.teamId).eq("channelId", args.channelId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listMessagesByThread = query({
  args: { teamId: v.string(), channelId: v.string(), threadTs: v.string(), limit: v.optional(v.number()) },
  returns: v.array(messageValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("threadTs", args.threadTs),
      )
      .take(args.limit ?? 100);
  },
});

export const recordMessage = mutation({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    ts: v.string(),
    threadTs: v.optional(v.string()),
    userId: v.optional(v.string()),
    botId: v.optional(v.string()),
    text: v.optional(v.string()),
    isBotMessage: v.boolean(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_team_channel_and_ts", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts),
      )
      .unique();
    // A message_changed (edit) event or our own postMessage confirmation can
    // arrive after the row already exists (e.g. an optimistic local record
    // followed by the event echo) -- treat this as the same upsert posture
    // as everywhere else rather than throwing on a duplicate ts.
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("messages", { ...args, createdAt: now, updatedAt: now });
  },
});

export const patchMessageEdited = mutation({
  args: { teamId: v.string(), channelId: v.string(), ts: v.string(), text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_team_channel_and_ts", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      text: args.text ?? existing.text,
      editedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markMessageDeleted = mutation({
  args: { teamId: v.string(), channelId: v.string(), ts: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_team_channel_and_ts", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export const listReactionsByMessage = query({
  args: { teamId: v.string(), channelId: v.string(), ts: v.string() },
  returns: v.array(reactionValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts),
      )
      .collect();
  },
});

// Applies a single reaction_added/reaction_removed delta. Not a plain
// upsert like the tables above: Slack sends one event per (user, emoji)
// toggle, so this reads the current row, adds/removes exactly one userId
// from its array, and only then writes -- mirroring convex-livekit's
// patchParticipant pattern of folding a partial event into existing state
// rather than replacing it.
export const applyReactionDelta = mutation({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    ts: v.string(),
    reaction: v.string(),
    userId: v.string(),
    added: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) =>
        q.eq("teamId", args.teamId).eq("channelId", args.channelId).eq("ts", args.ts).eq("reaction", args.reaction),
      )
      .unique();
    if (!existing) {
      if (!args.added) return null; // removing from a row we never saw -- nothing to do
      await ctx.db.insert("reactions", {
        teamId: args.teamId,
        channelId: args.channelId,
        ts: args.ts,
        reaction: args.reaction,
        userIds: [args.userId],
        updatedAt: now,
      });
      return null;
    }
    const nextUserIds = args.added
      ? Array.from(new Set([...existing.userIds, args.userId]))
      : existing.userIds.filter((id) => id !== args.userId);
    if (nextUserIds.length === 0) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.patch(existing._id, { userIds: nextUserIds, updatedAt: now });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Interactions & commands (audit logs)
// ---------------------------------------------------------------------------

export const recordInteraction = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    type: interactionTypeValidator,
    actionId: v.optional(v.string()),
    callbackId: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    payload: v.string(),
  },
  returns: v.id("interactions"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("interactions", { ...args, receivedAt: Date.now() });
  },
});

export const listInteractionsByTeam = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(interactionValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interactions")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const recordCommand = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    command: v.string(),
    text: v.optional(v.string()),
    channelId: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
  },
  returns: v.id("commands"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("commands", { ...args, receivedAt: Date.now() });
  },
});

export const listCommandsByTeam = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(commandValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commands")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const recordFile = mutation({
  args: {
    teamId: v.string(),
    fileId: v.string(),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    mimetype: v.optional(v.string()),
    size: v.optional(v.number()),
    url: v.optional(v.string()),
    permalink: v.optional(v.string()),
    channelId: v.optional(v.string()),
    ts: v.optional(v.string()),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("files", { ...args, uploadedAt: Date.now() });
  },
});

export const listFilesByTeam = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(fileValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ---------------------------------------------------------------------------
// Scheduled messages
// ---------------------------------------------------------------------------

export const recordScheduledMessage = mutation({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    scheduledMessageId: v.string(),
    postAt: v.number(),
    text: v.optional(v.string()),
  },
  returns: v.id("scheduledMessages"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("scheduledMessages", { ...args, status: "scheduled", createdAt: now, updatedAt: now });
  },
});

export const patchScheduledMessageStatus = mutation({
  args: { scheduledMessageId: v.string(), status: scheduledMessageStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("scheduledMessages")
      .withIndex("by_scheduledMessageId", (q) => q.eq("scheduledMessageId", args.scheduledMessageId))
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

export const listScheduledMessagesByTeam = query({
  args: { teamId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(scheduledMessageValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scheduledMessages")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ---------------------------------------------------------------------------
// Events API idempotency + stats
// ---------------------------------------------------------------------------

export const checkAndRecordEvent = mutation({
  args: { eventId: v.string(), eventType: v.string(), teamId: v.optional(v.string()), payload: v.string() },
  returns: v.object({ alreadyProcessed: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return { alreadyProcessed: true };
    await ctx.db.insert("webhookEvents", { ...args, receivedAt: Date.now() });
    return { alreadyProcessed: false };
  },
});

export const listRecentWebhookEvents = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(webhookEventValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhookEvents")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getStats = query({
  args: {},
  returns: v.object({
    installations: v.number(),
    channels: v.number(),
    users: v.number(),
    messages: v.number(),
    interactions: v.number(),
    commands: v.number(),
    files: v.number(),
  }),
  handler: async (ctx) => {
    const [installations, channels, users, messages, interactions, commands, files] = await Promise.all([
      ctx.db.query("installations").collect(),
      ctx.db.query("channels").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("messages").collect(),
      ctx.db.query("interactions").collect(),
      ctx.db.query("commands").collect(),
      ctx.db.query("files").collect(),
    ]);
    return {
      installations: installations.length,
      channels: channels.length,
      users: users.length,
      messages: messages.length,
      interactions: interactions.length,
      commands: commands.length,
      files: files.length,
    };
  },
});
