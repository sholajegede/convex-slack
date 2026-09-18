# convex-slack

Install your app into any number of Slack workspaces, sync channels,
messages, reactions, and users into your Convex database reactively, and
drive the full Slack platform -- messaging, threads, Block Kit modals,
slash commands, shortcuts, and files -- directly from Convex functions.

[![npm version](https://img.shields.io/npm/v/convex-slack.svg)](https://www.npmjs.com/package/convex-slack)
[![Convex Component](https://www.convex.dev/components/badge/sholajegede/convex-slack)](https://www.convex.dev/components/convex-slack)
[![npm downloads](https://img.shields.io/npm/dm/convex-slack.svg)](https://www.npmjs.com/package/convex-slack)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

```ts
const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

await slack.postMessage(ctx, {
  teamId,
  channel: "C0123456789",
  text: "Deal closed -- invoice sent.",
});

// Stays live from here -- messages, reactions, and interactions all update
// reactively as Slack's events arrive.
const messages = useQuery(api.example.listMessages, { teamId, channelId });
```

<!-- START: Include on https://convex.dev/components -->

## What this does

`convex-slack` gives your Convex app a live, queryable view of every Slack
workspace it's installed into, plus a full set of actions for driving the
platform -- kept in sync by Slack's Events API and interactivity payloads:

- **Multi-workspace OAuth install** -- `getAuthorizationUrl` / `exchangeCode`
  implement the full OAuth v2 authorization-code flow, storing one bot token
  per `team_id` so a single deployment serves every workspace that installs
  your app. Token rotation (refresh tokens) is handled transparently:
  `resolveToken` refreshes and persists a rotated token automatically before
  it expires.
- **Reactive messages, threads, and reactions** -- `message`,
  `message_changed`, `message_deleted`, `reaction_added`, and
  `reaction_removed` events keep a `messages` and `reactions` table current,
  so `useQuery` in your React app re-renders as a conversation happens.
- **Channels and users, synced on demand** -- `conversations.list/info` and
  `users.list/info` calls (yours or this component's own) populate `channels`
  and `users`, plus membership/rename/archive events keep them current
  without a full resync.
- **Full messaging** -- `postMessage`, `postEphemeral`, `updateMessage`,
  `deleteMessage`, `scheduleMessage`/`deleteScheduledMessage`, and
  `addReaction`/`removeReaction`, all callable directly from a Convex action.
- **Block Kit modals and App Home** -- `openView`/`pushView`/`updateView`
  wrap `views.open`/`views.push`/`views.update` for interactive modals, and
  `publishHomeView` wraps `views.publish` for a per-user App Home tab.
- **Slash commands and interactivity, verified and logged** -- three
  signed `httpAction` handlers (`eventsHandler`, `interactivityHandler`,
  `commandsHandler`) verify every request against your signing secret
  before anything is recorded, and every button click, modal submission,
  shortcut invocation, and slash command is logged to `interactions` /
  `commands` for your own handlers to react to.
- **Modern file uploads** -- `uploadFile` drives the current
  `files.getUploadURLExternal` -> upload -> `files.completeUploadExternal`
  sequence (the old `files.upload` is deprecated and never used here).
- **Resilient Web API calls** -- every outbound call retries on `429`/`5xx`
  responses and network failures with exponential backoff and jitter,
  honoring Slack's `Retry-After` header (and the JSON-level `ratelimited`
  error some methods return).
- **Cryptographically verified inbound requests** -- every Events API,
  Interactivity, and Slash Command delivery is verified against Slack's
  `v0=HMAC-SHA256(signingSecret, "v0:{timestamp}:{body}")` scheme, with a
  5-minute replay window, before it's trusted.

This is a [Convex component](https://convex.dev/components): its
`installations`, `channels`, `users`, `messages`, `reactions`,
`interactions`, `commands`, `files`, `scheduledMessages`, and
`webhookEvents` tables live in an isolated schema, not your app's schema,
and are only reachable through the functions this component exposes.

## Table of Contents

- [convex-slack](#convex-slack)
  - [What this does](#what-this-does)
  - [Table of Contents](#table-of-contents)
  - [Install](#install)
  - [Quick Start](#quick-start)
    - [1. Add the component](#1-add-the-component)
    - [2. Create your Slack app](#2-create-your-slack-app)
    - [3. Set environment variables](#3-set-environment-variables)
    - [4. Mount the HTTP handlers](#4-mount-the-http-handlers)
    - [5. Wire up the OAuth install flow](#5-wire-up-the-oauth-install-flow)
    - [6. Initialize the client](#6-initialize-the-client)
  - [Usage](#usage)
    - [Send a message](#send-a-message)
    - [Reply in a thread](#reply-in-a-thread)
    - [Open a modal from a slash command](#open-a-modal-from-a-slash-command)
    - [React to a button click](#react-to-a-button-click)
    - [Upload a file](#upload-a-file)
  - [Token rotation](#token-rotation)
  - [What's synced automatically vs. on demand](#whats-synced-automatically-vs-on-demand)
  - [Testing](#testing)
  - [License](#license)

<!-- END: Include on https://convex.dev/components -->

## Install

```sh
npm install convex-slack
```

## Quick Start

### 1. Add the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import slack from "convex-slack/convex.config";

const app = defineApp();
app.use(slack);
export default app;
```

### 2. Create your Slack app

Create an app at [api.slack.com/apps](https://api.slack.com/apps) (or from
an app manifest). Under **OAuth & Permissions**, add the bot scopes your app
needs (at minimum `chat:write`; add `channels:history`, `reactions:read`,
`users:read`, `files:write`, and others as your app requires) and a
Redirect URL pointing at your OAuth callback (step 5). Under **Event
Subscriptions**, turn events on and point the Request URL at your
`eventsHandler` (step 4) -- Slack verifies it live, so deploy first. Under
**Interactivity & Shortcuts**, do the same for `interactivityHandler`. Under
**Slash Commands**, create each command with its Request URL pointed at
`commandsHandler`.

### 3. Set environment variables

```sh
npx convex env set SLACK_CLIENT_ID xxxxxxxxxxxx.xxxxxxxxxxxx
npx convex env set SLACK_CLIENT_SECRET xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
npx convex env set SLACK_SIGNING_SECRET xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Mount the HTTP handlers

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { Slack } from "convex-slack";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const http = httpRouter();

http.route({ path: "/slack/events", method: "POST", handler: slack.eventsHandler });
http.route({ path: "/slack/interactivity", method: "POST", handler: slack.interactivityHandler });
http.route({ path: "/slack/commands", method: "POST", handler: slack.commandsHandler });

export default http;
```

### 5. Wire up the OAuth install flow

```ts
// convex/slackOAuth.ts
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import { Slack } from "convex-slack";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

// Link to this from an "Add to Slack" button:
// slack.getAuthorizationUrl({ redirectUri, scopes: ["chat:write", "channels:history"] })

export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });

  await slack.exchangeCode(ctx, {
    code,
    redirectUri: `${process.env.CONVEX_SITE_URL}/slack/oauth/callback`,
  });

  return new Response("Slack app installed! You can close this tab.");
});
```

```ts
// add to convex/http.ts
http.route({ path: "/slack/oauth/callback", method: "GET", handler: oauthCallback });
```

### 6. Initialize the client

```ts
// convex/example.ts
import { action, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Slack } from "convex-slack";
import { v } from "convex/values";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

export const sendMessage = action({
  args: { teamId: v.string(), channel: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    return await slack.postMessage(ctx, args);
  },
});

export const listMessages = query({
  args: { teamId: v.string(), channelId: v.string() },
  handler: async (ctx, args) => {
    return await slack.listMessagesByChannel(ctx, args);
  },
});
```

## Usage

### Send a message

```ts
await slack.postMessage(ctx, {
  teamId,
  channel: "C0123456789",
  text: "Deal closed -- invoice sent.",
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: "*Deal closed* -- invoice sent." } },
  ],
});
```

### Reply in a thread

```ts
await slack.postMessage(ctx, {
  teamId,
  channel,
  threadTs: parentTs,
  text: "Receipt attached.",
});
```

### Open a modal from a slash command

Your `commandsHandler` already recorded the invocation (with its
`trigger_id`) to the `commands` table -- react to it from an action that
runs right after, while the `trigger_id` is still valid (3 seconds):

```ts
await slack.openView(ctx, {
  teamId,
  triggerId,
  view: {
    type: "modal",
    callback_id: "invoice_modal",
    title: { type: "plain_text", text: "New invoice" },
    submit: { type: "plain_text", text: "Send" },
    blocks: [
      {
        type: "input",
        block_id: "amount",
        label: { type: "plain_text", text: "Amount" },
        element: { type: "plain_text_input", action_id: "value" },
      },
    ],
  },
});
```

### React to a button click

`interactivityHandler` records every `block_actions` payload to
`interactions`; have your own action poll or subscribe to that table (or
call `respondToUrl` directly with the payload's `response_url` once you've
processed it):

```ts
await slack.respondToUrl(responseUrl, {
  text: "Got it -- invoice sent.",
  replace_original: true,
});
```

### Upload a file

```ts
await slack.uploadFile(ctx, {
  teamId,
  filename: "invoice.pdf",
  content: pdfBytes, // Uint8Array
  channelId: "C0123456789",
  initialComment: "Here's the invoice.",
});
```

## Token rotation

If your app has [token rotation](https://docs.slack.dev/authentication/using-token-rotation/)
enabled, every method above refreshes an expiring bot token automatically
(via `resolveToken`) and persists the rotated pair -- no extra code needed.
Apps without rotation enabled simply never populate `botRefreshToken`/
`botTokenExpiresAt`, and `resolveToken` returns the stored token as-is.

## What's synced automatically vs. on demand

`messages`, `reactions`, `user_change`/`team_join`, channel
create/rename/archive, and app uninstall/token revocation are all synced
automatically as Slack's Events API delivers them -- no polling required.
`channels` and `users` are otherwise populated lazily: the first time your
app calls `listConversationsFromSlack`, `getConversationInfo`,
`getUserInfo`, or `listUsersFromSlack`, the same "sync what you're told,
backfill on demand" posture as the rest of this component.

## Testing

```sh
npm run test
npm run typecheck
```

Tests use [`convex-test`](https://www.npmjs.com/package/convex-test) at two
levels. `src/component/lib.test.ts` covers the component's mutations and
queries directly: installation lifecycle (install, token rotation, and
`uninstalledAt` on revocation), channel and user upserts, message
recording/editing/deletion, reaction deltas (add and remove converging on
the right set of reactors), interaction and command logging, file records,
scheduled-message status transitions, and webhook idempotency via
`checkAndRecordEvent`. `example/convex/http.test.ts` separately exercises
the three signed `httpAction` handlers end to end -- signing requests with
an independent HMAC-SHA256 implementation (not the component's own) to
verify each one rejects a missing signature, a wrong secret, a stale
timestamp, and a tampered body, correctly answers the Events API's
`url_verification` handshake, dedupes a retried event delivery, dispatches
message/reaction/channel/membership events into the right rows, and logs
`block_actions`, `view_submission`, `shortcut`, and slash command payloads
from `interactivityHandler` and `commandsHandler`.

## License

Apache-2.0
