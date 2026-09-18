import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Slack } from "../../src/client/index.js";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

export const getAuthorizationUrl = query({
  args: { redirectUri: v.string(), state: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    return slack.getAuthorizationUrl({
      redirectUri: args.redirectUri,
      state: args.state,
      scopes: [
        "chat:write",
        "chat:write.public",
        "chat:write.customize",
        "channels:history",
        "channels:read",
        "channels:manage",
        "groups:read",
        "reactions:read",
        "reactions:write",
        "users:read",
        "files:write",
        "commands",
      ],
    });
  },
});

export const listInstallations = query({
  args: {},
  handler: async (ctx) => {
    return await slack.listInstallations(ctx);
  },
});

export const listChannels = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    return await slack.listChannels(ctx, args);
  },
});

export const listMessages = query({
  args: { teamId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    return await slack.listMessagesByChannel(ctx, args);
  },
});

export const listReactions = query({
  args: { teamId: v.string(), channelId: v.string(), ts: v.string() },
  handler: async (ctx, args) => {
    return await slack.listReactionsByMessage(ctx, args);
  },
});

export const listInteractions = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    return await slack.listInteractionsByTeam(ctx, args);
  },
});

export const listCommands = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    return await slack.listCommandsByTeam(ctx, args);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    return await slack.getStats(ctx);
  },
});

export const sendMessage = action({
  args: {
    teamId: v.string(),
    channel: v.string(),
    text: v.string(),
    threadTs: v.optional(v.string()),
    username: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    iconEmoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await slack.postMessage(ctx, args);
  },
});

export const uploadDemoFile = action({
  args: { teamId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    const content = new TextEncoder().encode(
      "Uploaded by the convex-slack example app via slack.uploadFile.\n",
    );
    return await slack.uploadFile(ctx, {
      teamId: args.teamId,
      channelId: args.channelId,
      filename: "convex-slack-demo.txt",
      content,
      initialComment: "Here's a file uploaded straight from a Convex action.",
    });
  },
});

export const leaveChannel = action({
  args: { teamId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    return await slack.leaveConversation(ctx, { teamId: args.teamId, channel: args.channelId });
  },
});
