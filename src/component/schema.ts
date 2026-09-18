import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per Slack workspace this app is installed into. Keyed by Slack's
  // `team_id`, not `_id` — a workspace can uninstall and reinstall the app
  // (or grant more scopes) and it must resolve back to the same row. Kept
  // (not deleted) on uninstall via `uninstalledAt`, same convention as
  // convex-livekit's rooms/participants: a reactive "what happened to my
  // install" view needs the history, not a vanished row.
  installations: defineTable({
    teamId: v.string(),
    teamName: v.optional(v.string()),
    // Set only for Enterprise Grid installs (an org-wide install spans many
    // teamIds under one enterpriseId). Absent for a normal single-workspace
    // install.
    enterpriseId: v.optional(v.string()),
    appId: v.string(),
    botUserId: v.string(),
    // The bot token (`xoxb-...`). Never exposed to a browser/client — read
    // it server-side only, same treatment as convex-livekit's apiSecret.
    botToken: v.string(),
    botScope: v.string(), // comma-separated granted bot scopes, verbatim from oauth.v2.access
    // Present only when Slack's token rotation is enabled for this app.
    // When set, callers must refresh via oauth.v2.access with
    // grant_type=refresh_token before botTokenExpiresAt and persist the new
    // pair — see client/index.ts's ensureFreshToken.
    botRefreshToken: v.optional(v.string()),
    botTokenExpiresAt: v.optional(v.number()),
    // The user who completed the OAuth flow. Distinct from any per-user
    // token: this component only stores the bot token above; a user token
    // from `authed_user.access_token` is the installing app's own concern
    // if it needs one, not persisted here.
    authedUserId: v.string(),
    // Set only when the `incoming-webhook` scope was granted — lets a
    // simple integration post to the channel the installer picked without
    // needing a channel id up front.
    incomingWebhookUrl: v.optional(v.string()),
    incomingWebhookChannel: v.optional(v.string()),
    incomingWebhookChannelId: v.optional(v.string()),
    installedAt: v.number(),
    updatedAt: v.number(),
    // Set by the app_uninstalled / tokens_revoked events. A row with this
    // set is a dead install kept for history/audit — every public method
    // that resolves a token must treat it as "not installed".
    uninstalledAt: v.optional(v.number()),
  }).index("by_teamId", ["teamId"]),

  // Lazily-populated cache of conversations (public/private channels, DMs,
  // group DMs) the bot has seen — via conversations.list/info calls this
  // component makes, or via channel-shape events (channel_created,
  // channel_rename, member_joined_channel, ...). Not a guaranteed-complete
  // mirror of the workspace; it only has what the bot has been told about
  // or has looked up, same "sync what you're told, backfill on demand"
  // posture as convex-github's issues/pullRequests tables.
  channels: defineTable({
    teamId: v.string(),
    channelId: v.string(),
    name: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    isIm: v.optional(v.boolean()),
    isMpim: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    topic: v.optional(v.string()),
    purpose: v.optional(v.string()),
    // Set once, the first time the bot is confirmed a member (via
    // conversations.join or a member_joined_channel event naming the bot).
    // Cleared on member_left_channel for the bot. Lets callers filter to
    // "channels this app can actually post in" without another API call.
    botIsMember: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_team_and_channel", ["teamId", "channelId"]),

  // Lazily-populated cache of users, same posture as channels above --
  // filled in from users.info/users.list calls and from user fields
  // embedded in message/reaction/interaction events as they arrive.
  users: defineTable({
    teamId: v.string(),
    userId: v.string(),
    name: v.optional(v.string()),
    realName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    isBot: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    // Slack's own "deactivated" flag (from the `deleted` field on the user
    // object / a user_change event), not a row deletion — kept for the
    // same reason installations keep uninstalledAt instead of vanishing.
    deleted: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_team_and_user", ["teamId", "userId"]),

  // One row per message the bot has seen (via the Events API) or sent (via
  // this component's own postMessage/postEphemeral). Kept on delete (see
  // deletedAt) rather than removed, and kept on edit (see editedAt) rather
  // than overwritten blind, so a reactive thread view can show "edited" /
  // "deleted" the way Slack's own client does instead of the row just
  // disappearing or silently changing.
  messages: defineTable({
    teamId: v.string(),
    channelId: v.string(),
    // Slack's message `ts` — a string like "1699999999.000100" that is
    // simultaneously the message's unique id *and* its timestamp. Never
    // parse it as a display timestamp without knowing this; treat it as an
    // opaque id first, a float-seconds timestamp second.
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
  })
    .index("by_team_and_channel", ["teamId", "channelId"])
    .index("by_team_channel_and_ts", ["teamId", "channelId", "ts"])
    .index("by_thread", ["teamId", "channelId", "threadTs"]),

  // One row per (message, emoji) pair, holding the current set of reactors.
  // Slack's reaction_added/reaction_removed events are per-user deltas, not
  // a full snapshot — mirroring convex-livekit's ingress table, this is
  // upserted incrementally rather than replaced wholesale each time. See
  // client/index.ts's applyReactionDelta.
  reactions: defineTable({
    teamId: v.string(),
    channelId: v.string(),
    ts: v.string(),
    reaction: v.string(), // emoji name, no colons, e.g. "thumbsup"
    userIds: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_message", ["teamId", "channelId", "ts", "reaction"]),

  // Log of interactivity payloads: block_actions (buttons, selects, etc.),
  // view_submission / view_closed (modals), and shortcut (global and
  // message shortcuts). Unlike webhookEvents below, Slack does not retry
  // interactivity deliveries and these payloads carry no stable event id,
  // so this is an append-only audit/replay log, not a dedupe table.
  interactions: defineTable({
    teamId: v.string(),
    userId: v.string(),
    type: v.union(
      v.literal("block_actions"),
      v.literal("view_submission"),
      v.literal("view_closed"),
      v.literal("shortcut"),
      v.literal("message_action"),
    ),
    actionId: v.optional(v.string()),
    callbackId: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    // The full decoded interaction payload, verbatim, as JSON. Kept whole
    // (rather than picked apart into columns) because block_actions/
    // view_submission shapes vary per app and per block — callers that
    // need structured access parse this themselves; this table exists so
    // nothing is ever silently dropped on the floor.
    payload: v.string(),
    receivedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_type", ["teamId", "type"]),

  // Log of slash command invocations, same audit posture as interactions.
  commands: defineTable({
    teamId: v.string(),
    userId: v.string(),
    command: v.string(), // e.g. "/invoice"
    text: v.optional(v.string()),
    channelId: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_command", ["teamId", "command"]),

  // One row per file uploaded through this component's uploadFile (the
  // getUploadURLExternal -> PUT -> completeUploadExternal sequence — see
  // client/index.ts). Not a mirror of every file in the workspace, only
  // ones this app itself uploaded, so a reactive UI can show upload
  // progress/history without another round trip to files.info.
  files: defineTable({
    teamId: v.string(),
    fileId: v.string(),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    mimetype: v.optional(v.string()),
    size: v.optional(v.number()),
    url: v.optional(v.string()), // url_private
    permalink: v.optional(v.string()),
    channelId: v.optional(v.string()),
    ts: v.optional(v.string()), // the message ts the file was shared under, if any
    uploadedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_fileId", ["fileId"]),

  // One row per chat.scheduleMessage call, kept in sync with
  // scheduled_message_sent / scheduled_message_failed webhook events (an
  // optional subscription; a workspace that never enables the event will
  // simply keep the row at "scheduled" past postAt, which is fine — this
  // is a nice-to-have status field, not a source of truth Slack depends on
  // for anything).
  scheduledMessages: defineTable({
    teamId: v.string(),
    channelId: v.string(),
    scheduledMessageId: v.string(),
    postAt: v.number(),
    text: v.optional(v.string()),
    status: v.union(v.literal("scheduled"), v.literal("sent"), v.literal("deleted")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_scheduledMessageId", ["scheduledMessageId"]),

  // Events API idempotency, identical convention to every other component
  // in this set (convex-livekit, convex-github, convex-linear, ...): Slack
  // retries an Events API delivery that doesn't get a fast 200, and retried
  // deliveries carry the same `event_id` — this is the dedupe key.
  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    teamId: v.optional(v.string()),
    payload: v.string(),
    receivedAt: v.number(),
  }).index("by_eventId", ["eventId"]),
});
