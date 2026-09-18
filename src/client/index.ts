import { httpActionGeneric } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export type SlackOptions = {
  /** Your Slack app's Client ID, from the Basic Information page. */
  clientId: string;
  /** Your Slack app's Client Secret. Never expose this to a browser/client. */
  clientSecret: string;
  /**
   * Your Slack app's Signing Secret, used to verify that Events API,
   * Interactivity, and Slash Command deliveries actually came from Slack.
   */
  signingSecret: string;
};

export type AuthorizeUrlArgs = {
  redirectUri: string;
  /** Bot scopes, e.g. ["chat:write", "channels:history"]. */
  scopes: string[];
  /** Optional user scopes, for acting on behalf of the installing user. */
  userScopes?: string[];
  /** Opaque value round-tripped back to your redirect -- verify it yourself to guard against CSRF. */
  state?: string;
};

export type ExchangeCodeArgs = {
  code: string;
  redirectUri: string;
};

export type PostMessageArgs = {
  teamId: string;
  channel: string;
  text?: string;
  blocks?: unknown[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
};

export type PostEphemeralArgs = {
  teamId: string;
  channel: string;
  user: string;
  text?: string;
  blocks?: unknown[];
  threadTs?: string;
};

export type UpdateMessageArgs = {
  teamId: string;
  channel: string;
  ts: string;
  text?: string;
  blocks?: unknown[];
};

export type DeleteMessageArgs = { teamId: string; channel: string; ts: string };

export type ScheduleMessageArgs = {
  teamId: string;
  channel: string;
  postAt: number; // unix seconds, matching Slack's own post_at
  text?: string;
  blocks?: unknown[];
};

export type ReactionArgs = { teamId: string; channel: string; ts: string; name: string };

export type OpenViewArgs = { teamId: string; triggerId: string; view: unknown };
export type PushViewArgs = { teamId: string; triggerId: string; view: unknown };
export type UpdateViewArgs = { teamId: string; viewId: string; view: unknown; hash?: string };
export type PublishHomeViewArgs = { teamId: string; userId: string; view: unknown };

export type ListConversationsArgs = {
  teamId: string;
  types?: string; // comma-separated: "public_channel,private_channel,mpim,im"
  cursor?: string;
  limit?: number;
  excludeArchived?: boolean;
};

export type ConversationHistoryArgs = { teamId: string; channel: string; cursor?: string; limit?: number; oldest?: string; latest?: string };
export type ConversationRepliesArgs = { teamId: string; channel: string; ts: string; cursor?: string; limit?: number };
export type InviteToConversationArgs = { teamId: string; channel: string; users: string[] };
export type SetTopicArgs = { teamId: string; channel: string; topic: string };
export type SetPurposeArgs = { teamId: string; channel: string; purpose: string };

export type UploadFileArgs = {
  teamId: string;
  filename: string;
  /** Raw file bytes. For text content, encode with a TextEncoder first. */
  content: Uint8Array;
  channelId?: string;
  initialComment?: string;
  threadTs?: string;
  title?: string;
};

// ---------------------------------------------------------------------------
// Crypto & retry helpers (Web Crypto only -- runs in Convex's V8 isolate,
// same constraint convex-livekit and convex-github's webhook verification
// are written under; no node:crypto).
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 16000);
  return base / 2 + Math.random() * (base / 2); // jittered, same shape as convex-livekit's backoffDelayMs
}

const MAX_RETRIES = 5;

// Every outbound Slack Web API call goes through here: retries on 429/5xx
// and network failures with exponential backoff, honoring Slack's own
// `Retry-After` header on 429s exactly like convex-livekit's twirpRequest
// honors LiveKit's. Slack's Web API always answers 200 with a JSON body
// (even for application-level errors -- `ok: false` + `error`), so a
// non-2xx here means a transport/proxy failure, not a Slack error; those
// are surfaced as SlackApiError from the JSON body instead.
async function slackApiRequest<T = Record<string, unknown>>(
  token: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const useJson = method === "views.open" || method === "views.push" || method === "views.update" || method === "views.publish";
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      const contentType = useJson
        ? "application/json; charset=utf-8"
        : "application/x-www-form-urlencoded; charset=utf-8";
      const headers: Record<string, string> = { "Content-Type": contentType };
      // oauth.v2.access authenticates via client_id/client_secret in the
      // body, not a bearer token -- callers pass an empty token for it, so
      // no Authorization header goes out at all in that one case.
      if (token) headers.Authorization = `Bearer ${token}`;
      response = await fetch(`https://slack.com/api/${method}`, {
        method: "POST",
        headers,
        body: useJson ? JSON.stringify(args) : formEncode(args),
      });
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(backoffDelayMs(attempt));
      continue;
    }

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffDelayMs(attempt);
      await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffDelayMs(attempt));
      continue;
    }

    const json = (await response.json()) as { ok: boolean; error?: string; [key: string]: unknown };
    if (!json.ok) {
      // rate_limited can also surface at the JSON level on some methods;
      // treat it the same as an HTTP 429 rather than failing immediately.
      if (json.error === "ratelimited" && attempt < MAX_RETRIES) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffDelayMs(attempt);
        await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffDelayMs(attempt));
        continue;
      }
      throw new SlackApiError(method, json.error ?? "unknown_error", json);
    }
    return json as T;
  }
  throw lastError instanceof Error ? lastError : new Error(`convex-slack: ${method} failed after retries`);
}

export class SlackApiError extends Error {
  constructor(
    public method: string,
    public slackError: string,
    public response: Record<string, unknown>,
  ) {
    super(`convex-slack: ${method} failed: ${slackError}`);
    this.name = "SlackApiError";
  }
}

function formEncode(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return params.toString();
}

// Slack's request-signature scheme (shared by Events API, Interactivity,
// and Slash Commands): v0=HMAC_SHA256(signingSecret, "v0:{timestamp}:{rawBody}").
// See https://docs.slack.dev/authentication/verifying-requests-from-slack/.
// A >5 minute clock skew is rejected as a possible replay, matching Slack's
// own documented guidance.
async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > 60 * 5) return false;
  const expected = `v0=${await hmacSha256Hex(signingSecret, `v0:${timestamp}:${rawBody}`)}`;
  return timingSafeEqual(expected, signature);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export class Slack {
  /** Mount on any POST route -- this is where Slack's Events API subscription must point. */
  eventsHandler: ReturnType<typeof httpActionGeneric>;
  /** Mount on the route configured under "Interactivity & Shortcuts" (buttons, modals, shortcuts). */
  interactivityHandler: ReturnType<typeof httpActionGeneric>;
  /** Mount on the route configured as the Request URL for each slash command. */
  commandsHandler: ReturnType<typeof httpActionGeneric>;

  constructor(
    private component: ComponentApi,
    private options: SlackOptions,
  ) {
    const component_ = component;
    const { signingSecret } = options;

    this.eventsHandler = httpActionGeneric(async (ctx, request) => {
      const rawBody = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp");
      const signature = request.headers.get("x-slack-signature");
      if (!timestamp || !signature) {
        return jsonResponse({ error: "Missing Slack signature headers" }, 400);
      }
      if (!(await verifySlackSignature(signingSecret, timestamp, rawBody, signature))) {
        console.error("convex-slack: events request signature mismatch");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }

      const body = JSON.parse(rawBody) as Record<string, unknown>;

      // The one-time URL verification handshake Slack performs when you
      // first save an Events API request URL -- echo the challenge back,
      // unsigned-body-shape and all, before any of our own logic runs.
      if (body.type === "url_verification") {
        return jsonResponse({ challenge: body.challenge });
      }

      if (body.type !== "event_callback") {
        return jsonResponse({ ok: true });
      }

      const eventId = String(body.event_id ?? "");
      if (!eventId) return jsonResponse({ error: "Missing event_id" }, 400);

      const { alreadyProcessed } = await ctx.runMutation(component_.lib.checkAndRecordEvent, {
        eventId,
        eventType: String((body.event as Record<string, unknown> | undefined)?.type ?? "unknown"),
        teamId: body.team_id ? String(body.team_id) : undefined,
        payload: rawBody,
      });
      if (alreadyProcessed) {
        return jsonResponse({ ok: true, duplicate: true });
      }

      await dispatchEvent(ctx, component_, body);
      return jsonResponse({ ok: true });
    });

    this.interactivityHandler = httpActionGeneric(async (ctx, request) => {
      const rawBody = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp");
      const signature = request.headers.get("x-slack-signature");
      if (!timestamp || !signature) {
        return jsonResponse({ error: "Missing Slack signature headers" }, 400);
      }
      if (!(await verifySlackSignature(signingSecret, timestamp, rawBody, signature))) {
        console.error("convex-slack: interactivity request signature mismatch");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }

      // Interactivity payloads arrive form-encoded with a single `payload`
      // field holding the actual JSON -- distinct from the Events API,
      // which posts JSON directly as the whole body.
      const form = new URLSearchParams(rawBody);
      const payloadRaw = form.get("payload");
      if (!payloadRaw) return jsonResponse({ error: "Missing payload" }, 400);
      const payload = JSON.parse(payloadRaw) as Record<string, unknown>;

      const teamId = String((payload.team as Record<string, unknown> | undefined)?.id ?? "");
      const userId = String((payload.user as Record<string, unknown> | undefined)?.id ?? "");
      const type = String(payload.type ?? "");

      if (teamId && userId && isInteractionType(type)) {
        const firstAction = Array.isArray(payload.actions) ? (payload.actions[0] as Record<string, unknown>) : undefined;
        await ctx.runMutation(component_.lib.recordInteraction, {
          teamId,
          userId,
          type,
          actionId: firstAction ? String(firstAction.action_id ?? "") || undefined : undefined,
          callbackId:
            (payload.callback_id as string | undefined) ??
            ((payload.view as Record<string, unknown> | undefined)?.callback_id as string | undefined),
          triggerId: (payload.trigger_id as string | undefined) ?? undefined,
          payload: payloadRaw,
        });
      }

      // view_submission can reject the submission (validation errors) by
      // returning a `response_action` body -- callers that need this should
      // wrap interactivityHandler rather than use it directly; the default
      // here is a plain ack, which is correct for block_actions/shortcut/
      // view_closed and for a view_submission with no validation to do.
      return jsonResponse({});
    });

    this.commandsHandler = httpActionGeneric(async (ctx, request) => {
      const rawBody = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp");
      const signature = request.headers.get("x-slack-signature");
      if (!timestamp || !signature) {
        return jsonResponse({ error: "Missing Slack signature headers" }, 400);
      }
      if (!(await verifySlackSignature(signingSecret, timestamp, rawBody, signature))) {
        console.error("convex-slack: command request signature mismatch");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }

      const form = new URLSearchParams(rawBody);
      const teamId = form.get("team_id");
      const userId = form.get("user_id");
      const command = form.get("command");
      if (!teamId || !userId || !command) {
        return jsonResponse({ error: "Malformed command payload" }, 400);
      }

      await ctx.runMutation(component_.lib.recordCommand, {
        teamId,
        userId,
        command,
        text: form.get("text") ?? undefined,
        channelId: form.get("channel_id") ?? undefined,
        triggerId: form.get("trigger_id") ?? undefined,
        responseUrl: form.get("response_url") ?? undefined,
      });

      // Ack with nothing visible by default (empty 200) -- most apps open a
      // modal with the trigger_id instead of replying inline; callers that
      // want an immediate text reply should build their own handler on top
      // of the recorded row this call already wrote, or reply via
      // respondToUrl using the response_url captured above.
      return jsonResponse({});
    });
  }

  // -------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------

  /** Build the `https://slack.com/oauth/v2/authorize` URL to send an installer to. */
  getAuthorizationUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      scope: args.scopes.join(","),
      redirect_uri: args.redirectUri,
    });
    if (args.userScopes && args.userScopes.length > 0) {
      params.set("user_scope", args.userScopes.join(","));
    }
    if (args.state) params.set("state", args.state);
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges the `code` Slack redirected back with for a bot token, and
   * persists (or updates) the installation. Call this from the action
   * behind your OAuth redirect URI. Verify `state` yourself against
   * whatever you generated in getAuthorizationUrl before calling this --
   * this component doesn't manage state/CSRF tokens for you.
   */
  async exchangeCode(ctx: RunMutationCtx, args: ExchangeCodeArgs) {
    const json = await slackApiRequest<{
      access_token: string;
      bot_user_id: string;
      app_id: string;
      scope: string;
      team: { id: string; name?: string };
      enterprise?: { id: string; name?: string } | null;
      authed_user: { id: string };
      refresh_token?: string;
      expires_in?: number;
      incoming_webhook?: { url?: string; channel?: string; channel_id?: string };
    }>("", "oauth.v2.access", {
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      code: args.code,
      redirect_uri: args.redirectUri,
    });

    const installationId = await ctx.runMutation(this.component.lib.upsertInstallation, {
      teamId: json.team.id,
      teamName: json.team.name,
      enterpriseId: json.enterprise?.id,
      appId: json.app_id,
      botUserId: json.bot_user_id,
      botToken: json.access_token,
      botScope: json.scope,
      botRefreshToken: json.refresh_token,
      botTokenExpiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      authedUserId: json.authed_user.id,
      incomingWebhookUrl: json.incoming_webhook?.url,
      incomingWebhookChannel: json.incoming_webhook?.channel,
      incomingWebhookChannelId: json.incoming_webhook?.channel_id,
    });

    return { installationId, teamId: json.team.id, botUserId: json.bot_user_id };
  }

  /**
   * Refreshes a rotated bot token using the stored refresh token. Only
   * meaningful for apps with token rotation enabled (Slack issues a
   * `refresh_token` + `expires_in` in that case) -- a no-op (returns null)
   * for apps without rotation, since resolveToken's tokens simply don't
   * expire for them. Safe to call proactively; resolveToken also calls this
   * automatically when a stored token is close to expiring.
   */
  async refreshToken(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string }) {
    const installation = await ctx.runQuery(this.component.lib.getInstallation, { teamId: args.teamId });
    if (!installation || !installation.botRefreshToken) return null;

    const json = await slackApiRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>("", "oauth.v2.access", {
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "refresh_token",
      refresh_token: installation.botRefreshToken,
    });

    await ctx.runMutation(this.component.lib.patchInstallationToken, {
      teamId: args.teamId,
      botToken: json.access_token,
      botRefreshToken: json.refresh_token ?? installation.botRefreshToken,
      botTokenExpiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
    });

    return json.access_token;
  }

  /**
   * Resolves a live bot token for a team, refreshing it first if rotation
   * is enabled and the stored token is within 5 minutes of expiring.
   * Throws if the workspace was never installed, or has since uninstalled
   * (see installations.uninstalledAt) -- every Web API method below calls
   * this before making a request.
   */
  private async resolveToken(ctx: RunQueryCtx & RunMutationCtx, teamId: string): Promise<string> {
    const installation = await ctx.runQuery(this.component.lib.getInstallation, { teamId });
    if (!installation || installation.uninstalledAt) {
      throw new Error(`convex-slack: no active installation for team ${teamId}`);
    }
    if (installation.botTokenExpiresAt && installation.botTokenExpiresAt - Date.now() < 5 * 60 * 1000) {
      const refreshed = await this.refreshToken(ctx, { teamId });
      if (refreshed) return refreshed;
    }
    return installation.botToken;
  }

  // -------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------

  async postMessage(ctx: RunQueryCtx & RunMutationCtx, args: PostMessageArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ ts: string; channel: string }>(token, "chat.postMessage", {
      channel: args.channel,
      text: args.text,
      blocks: args.blocks,
      thread_ts: args.threadTs,
      reply_broadcast: args.replyBroadcast,
      unfurl_links: args.unfurlLinks,
      unfurl_media: args.unfurlMedia,
    });
    await ctx.runMutation(this.component.lib.recordMessage, {
      teamId: args.teamId,
      channelId: json.channel,
      ts: json.ts,
      threadTs: args.threadTs,
      text: args.text,
      isBotMessage: true,
    });
    return json;
  }

  async postEphemeral(ctx: RunQueryCtx & RunMutationCtx, args: PostEphemeralArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    // Ephemeral messages are never delivered as a message_* event and only
    // the requesting user ever sees them, so there's nothing durable to
    // record in the messages table -- this is a fire-and-forget send.
    return await slackApiRequest<{ message_ts: string }>(token, "chat.postEphemeral", {
      channel: args.channel,
      user: args.user,
      text: args.text,
      blocks: args.blocks,
      thread_ts: args.threadTs,
    });
  }

  async updateMessage(ctx: RunQueryCtx & RunMutationCtx, args: UpdateMessageArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ ts: string; channel: string }>(token, "chat.update", {
      channel: args.channel,
      ts: args.ts,
      text: args.text,
      blocks: args.blocks,
    });
    await ctx.runMutation(this.component.lib.patchMessageEdited, {
      teamId: args.teamId,
      channelId: args.channel,
      ts: args.ts,
      text: args.text,
    });
    return json;
  }

  async deleteMessage(ctx: RunQueryCtx & RunMutationCtx, args: DeleteMessageArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest(token, "chat.delete", { channel: args.channel, ts: args.ts });
    await ctx.runMutation(this.component.lib.markMessageDeleted, {
      teamId: args.teamId,
      channelId: args.channel,
      ts: args.ts,
    });
    return json;
  }

  async scheduleMessage(ctx: RunQueryCtx & RunMutationCtx, args: ScheduleMessageArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ scheduled_message_id: string; post_at: number; channel: string }>(
      token,
      "chat.scheduleMessage",
      { channel: args.channel, text: args.text, blocks: args.blocks, post_at: args.postAt },
    );
    await ctx.runMutation(this.component.lib.recordScheduledMessage, {
      teamId: args.teamId,
      channelId: json.channel,
      scheduledMessageId: json.scheduled_message_id,
      postAt: json.post_at * 1000,
      text: args.text,
    });
    return json;
  }

  async deleteScheduledMessage(
    ctx: RunQueryCtx & RunMutationCtx,
    args: { teamId: string; channel: string; scheduledMessageId: string },
  ) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest(token, "chat.deleteScheduledMessage", {
      channel: args.channel,
      scheduled_message_id: args.scheduledMessageId,
    });
    await ctx.runMutation(this.component.lib.patchScheduledMessageStatus, {
      scheduledMessageId: args.scheduledMessageId,
      status: "deleted",
    });
    return json;
  }

  async addReaction(ctx: RunQueryCtx & RunMutationCtx, args: ReactionArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest(token, "reactions.add", {
      channel: args.channel,
      timestamp: args.ts,
      name: args.name,
    });
    // Optimistically reflect our own action locally -- the reaction_added
    // event for our own bot user will also arrive and apply the same
    // delta again, which applyReactionDelta's Set-based dedupe absorbs
    // harmlessly.
    return json;
  }

  async removeReaction(ctx: RunQueryCtx & RunMutationCtx, args: ReactionArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest(token, "reactions.remove", {
      channel: args.channel,
      timestamp: args.ts,
      name: args.name,
    });
  }

  /**
   * Posts a followup to a `response_url` captured from a slash command or
   * interactivity payload. Not team-scoped -- response_url is a one-time,
   * pre-authenticated URL Slack hands you directly, good for up to 5 uses
   * within 30 minutes, so no bot token is needed or used here.
   */
  async respondToUrl(
    responseUrl: string,
    body: { text?: string; blocks?: unknown[]; response_type?: "in_channel" | "ephemeral"; replace_original?: boolean; delete_original?: boolean },
  ) {
    const response = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`convex-slack: response_url post failed: ${response.status} ${await response.text()}`);
    }
  }

  // -------------------------------------------------------------------
  // Conversations (channels, DMs, group DMs)
  // -------------------------------------------------------------------

  async listConversationsFromSlack(ctx: RunQueryCtx & RunMutationCtx, args: ListConversationsArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{
      channels: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.list", {
      types: args.types ?? "public_channel,private_channel",
      cursor: args.cursor,
      limit: args.limit ?? 200,
      exclude_archived: args.excludeArchived,
    });
    for (const channel of json.channels) {
      await ctx.runMutation(this.component.lib.upsertChannel, {
        teamId: args.teamId,
        channelId: String(channel.id),
        name: (channel.name as string | undefined) ?? undefined,
        isPrivate: (channel.is_private as boolean | undefined) ?? undefined,
        isIm: (channel.is_im as boolean | undefined) ?? undefined,
        isMpim: (channel.is_mpim as boolean | undefined) ?? undefined,
        isArchived: (channel.is_archived as boolean | undefined) ?? undefined,
        topic: ((channel.topic as Record<string, unknown> | undefined)?.value as string | undefined) ?? undefined,
        purpose: ((channel.purpose as Record<string, unknown> | undefined)?.value as string | undefined) ?? undefined,
      });
    }
    return { channels: json.channels, nextCursor: json.response_metadata?.next_cursor };
  }

  async getConversationInfo(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string; channel: string }) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ channel: Record<string, unknown> }>(token, "conversations.info", {
      channel: args.channel,
    });
    const channel = json.channel;
    await this.upsertChannelFromSlackShape(ctx, args.teamId, channel);
    return channel;
  }

  async joinConversation(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string; channel: string }) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ channel: Record<string, unknown> }>(token, "conversations.join", {
      channel: args.channel,
    });
    await ctx.runMutation(this.component.lib.upsertChannel, {
      teamId: args.teamId,
      channelId: args.channel,
      botIsMember: true,
    });
    return json.channel;
  }

  /**
   * Removes the bot from a channel via its own token (`conversations.leave`).
   * This is the reliable, documented way to make the bot actually leave --
   * unlike the "Remove from this channel" action in Slack's Agents & Apps
   * UI, which (per Slack's own semantics for chat:write.public apps) may
   * only update the app's channel association without ever calling
   * conversations.kick, so it can leave real membership untouched and never
   * fire member_left_channel. Mirrors joinConversation: this call sets
   * channels.botIsMember directly, so the local read model updates
   * immediately regardless of whether Slack's webhook event arrives.
   */
  async leaveConversation(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string; channel: string }) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ not_in_channel?: boolean }>(token, "conversations.leave", {
      channel: args.channel,
    });
    await ctx.runMutation(this.component.lib.upsertChannel, {
      teamId: args.teamId,
      channelId: args.channel,
      botIsMember: false,
    });
    return json;
  }

  async inviteToConversation(ctx: RunQueryCtx & RunMutationCtx, args: InviteToConversationArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest(token, "conversations.invite", {
      channel: args.channel,
      users: args.users.join(","),
    });
  }

  async getConversationHistory(ctx: RunQueryCtx & RunMutationCtx, args: ConversationHistoryArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.history", {
      channel: args.channel,
      cursor: args.cursor,
      limit: args.limit ?? 100,
      oldest: args.oldest,
      latest: args.latest,
    });
  }

  async getConversationReplies(ctx: RunQueryCtx & RunMutationCtx, args: ConversationRepliesArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.replies", { channel: args.channel, ts: args.ts, cursor: args.cursor, limit: args.limit ?? 100 });
  }

  async setConversationTopic(ctx: RunQueryCtx & RunMutationCtx, args: SetTopicArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest(token, "conversations.setTopic", { channel: args.channel, topic: args.topic });
  }

  async setConversationPurpose(ctx: RunQueryCtx & RunMutationCtx, args: SetPurposeArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest(token, "conversations.setPurpose", { channel: args.channel, purpose: args.purpose });
  }

  private async upsertChannelFromSlackShape(ctx: RunMutationCtx, teamId: string, channel: Record<string, unknown>) {
    await ctx.runMutation(this.component.lib.upsertChannel, {
      teamId,
      channelId: String(channel.id),
      name: (channel.name as string | undefined) ?? undefined,
      isPrivate: (channel.is_private as boolean | undefined) ?? undefined,
      isIm: (channel.is_im as boolean | undefined) ?? undefined,
      isMpim: (channel.is_mpim as boolean | undefined) ?? undefined,
      isArchived: (channel.is_archived as boolean | undefined) ?? undefined,
      topic: ((channel.topic as Record<string, unknown> | undefined)?.value as string | undefined) ?? undefined,
      purpose: ((channel.purpose as Record<string, unknown> | undefined)?.value as string | undefined) ?? undefined,
    });
  }

  // -------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------

  async getUserInfo(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string; user: string }) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{ user: Record<string, unknown> }>(token, "users.info", { user: args.user });
    const user = json.user;
    const profile = user.profile as Record<string, unknown> | undefined;
    await ctx.runMutation(this.component.lib.upsertUser, {
      teamId: args.teamId,
      userId: String(user.id),
      name: (user.name as string | undefined) ?? undefined,
      realName: (user.real_name as string | undefined) ?? undefined,
      displayName: (profile?.display_name as string | undefined) ?? undefined,
      email: (profile?.email as string | undefined) ?? undefined,
      isBot: (user.is_bot as boolean | undefined) ?? undefined,
      isAdmin: (user.is_admin as boolean | undefined) ?? undefined,
      deleted: (user.deleted as boolean | undefined) ?? undefined,
    });
    return user;
  }

  async listUsersFromSlack(ctx: RunQueryCtx & RunMutationCtx, args: { teamId: string; cursor?: string; limit?: number }) {
    const token = await this.resolveToken(ctx, args.teamId);
    const json = await slackApiRequest<{
      members: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
    }>(token, "users.list", { cursor: args.cursor, limit: args.limit ?? 200 });
    for (const user of json.members) {
      const profile = user.profile as Record<string, unknown> | undefined;
      await ctx.runMutation(this.component.lib.upsertUser, {
        teamId: args.teamId,
        userId: String(user.id),
        name: (user.name as string | undefined) ?? undefined,
        realName: (user.real_name as string | undefined) ?? undefined,
        displayName: (profile?.display_name as string | undefined) ?? undefined,
        email: (profile?.email as string | undefined) ?? undefined,
        isBot: (user.is_bot as boolean | undefined) ?? undefined,
        isAdmin: (user.is_admin as boolean | undefined) ?? undefined,
        deleted: (user.deleted as boolean | undefined) ?? undefined,
      });
    }
    return { members: json.members, nextCursor: json.response_metadata?.next_cursor };
  }

  // -------------------------------------------------------------------
  // Modals (Block Kit views)
  // -------------------------------------------------------------------

  /** trigger_id is only valid for 3 seconds and can only be used once -- call this immediately on receiving it. */
  async openView(ctx: RunQueryCtx & RunMutationCtx, args: OpenViewArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{ view: Record<string, unknown> }>(token, "views.open", {
      trigger_id: args.triggerId,
      view: args.view,
    });
  }

  /** Pushes a new view onto the modal stack (max depth 3), using the same one-shot trigger_id rule as openView. */
  async pushView(ctx: RunQueryCtx & RunMutationCtx, args: PushViewArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{ view: Record<string, unknown> }>(token, "views.push", {
      trigger_id: args.triggerId,
      view: args.view,
    });
  }

  /** Updates an already-open view by id -- use this from a block_actions handler, not a trigger_id (there isn't a fresh one). */
  async updateView(ctx: RunQueryCtx & RunMutationCtx, args: UpdateViewArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{ view: Record<string, unknown> }>(token, "views.update", {
      view_id: args.viewId,
      view: args.view,
      hash: args.hash,
    });
  }

  /** Publishes (or replaces) a user's App Home tab. */
  async publishHomeView(ctx: RunQueryCtx & RunMutationCtx, args: PublishHomeViewArgs) {
    const token = await this.resolveToken(ctx, args.teamId);
    return await slackApiRequest<{ view: Record<string, unknown> }>(token, "views.publish", {
      user_id: args.userId,
      view: args.view,
    });
  }

  // -------------------------------------------------------------------
  // Files (the getUploadURLExternal -> PUT -> completeUploadExternal
  // sequence -- files.upload is deprecated and this component never calls it)
  // -------------------------------------------------------------------

  async uploadFile(ctx: RunQueryCtx & RunMutationCtx, args: UploadFileArgs) {
    const token = await this.resolveToken(ctx, args.teamId);

    const { upload_url, file_id } = await slackApiRequest<{ upload_url: string; file_id: string }>(
      token,
      "files.getUploadURLExternal",
      { filename: args.filename, length: args.content.byteLength },
    );

    const putResponse = await fetch(upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      // Uint8Array's ArrayBufferLike generic doesn't structurally match
      // BodyInit under this project's lib config even though every real
      // fetch implementation (browser, Node, and Convex's own V8 isolate)
      // accepts a Uint8Array body at runtime -- narrow the type at the
      // call site rather than loosen it for every caller of uploadFile.
      body: args.content as BodyInit,
    });
    if (!putResponse.ok) {
      throw new Error(`convex-slack: file upload PUT failed: ${putResponse.status} ${await putResponse.text()}`);
    }

    const completed = await slackApiRequest<{ files: Array<Record<string, unknown>> }>(
      token,
      "files.completeUploadExternal",
      {
        files: [{ id: file_id, title: args.title ?? args.filename }],
        channel_id: args.channelId,
        initial_comment: args.initialComment,
        thread_ts: args.threadTs,
      },
    );

    const file = completed.files[0];
    await ctx.runMutation(this.component.lib.recordFile, {
      teamId: args.teamId,
      fileId: file_id,
      name: args.filename,
      title: (file?.title as string | undefined) ?? args.title,
      mimetype: (file?.mimetype as string | undefined) ?? undefined,
      size: (file?.size as number | undefined) ?? args.content.byteLength,
      url: (file?.url_private as string | undefined) ?? undefined,
      permalink: (file?.permalink as string | undefined) ?? undefined,
      channelId: args.channelId,
      ts: undefined,
    });

    return file;
  }

  // -------------------------------------------------------------------
  // Reactive reads -- thin passthroughs to the component's own queries,
  // same convention as convex-livekit's getRoom/listRooms/etc. Call these
  // from your own `query` functions so `useQuery` in a React app re-renders
  // as installs, messages, reactions, and interactions arrive.
  // -------------------------------------------------------------------

  async getInstallation(ctx: RunQueryCtx, args: { teamId: string }) {
    return await ctx.runQuery(this.component.lib.getInstallation, args);
  }

  async listInstallations(ctx: RunQueryCtx, args: { limit?: number } = {}) {
    return await ctx.runQuery(this.component.lib.listInstallations, args);
  }

  async getChannel(ctx: RunQueryCtx, args: { teamId: string; channelId: string }) {
    return await ctx.runQuery(this.component.lib.getChannel, args);
  }

  async listChannels(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listChannels, args);
  }

  async getUser(ctx: RunQueryCtx, args: { teamId: string; userId: string }) {
    return await ctx.runQuery(this.component.lib.getUser, args);
  }

  async listUsers(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listUsers, args);
  }

  async getMessage(ctx: RunQueryCtx, args: { teamId: string; channelId: string; ts: string }) {
    return await ctx.runQuery(this.component.lib.getMessage, args);
  }

  async listMessagesByChannel(ctx: RunQueryCtx, args: { teamId: string; channelId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listMessagesByChannel, args);
  }

  async listMessagesByThread(
    ctx: RunQueryCtx,
    args: { teamId: string; channelId: string; threadTs: string; limit?: number },
  ) {
    return await ctx.runQuery(this.component.lib.listMessagesByThread, args);
  }

  async listReactionsByMessage(ctx: RunQueryCtx, args: { teamId: string; channelId: string; ts: string }) {
    return await ctx.runQuery(this.component.lib.listReactionsByMessage, args);
  }

  async listInteractionsByTeam(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listInteractionsByTeam, args);
  }

  async listCommandsByTeam(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listCommandsByTeam, args);
  }

  async listFilesByTeam(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listFilesByTeam, args);
  }

  async listScheduledMessagesByTeam(ctx: RunQueryCtx, args: { teamId: string; limit?: number }) {
    return await ctx.runQuery(this.component.lib.listScheduledMessagesByTeam, args);
  }

  async listRecentWebhookEvents(ctx: RunQueryCtx, args: { limit?: number } = {}) {
    return await ctx.runQuery(this.component.lib.listRecentWebhookEvents, args);
  }

  async getStats(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.lib.getStats, {});
  }
}

function isInteractionType(
  value: string,
): value is "block_actions" | "view_submission" | "view_closed" | "shortcut" | "message_action" {
  return ["block_actions", "view_submission", "view_closed", "shortcut", "message_action"].includes(value);
}

// Dispatches one already-deduped Events API `event_callback` body to the
// component tables it affects. Only fields this component actually models
// are synced -- an event type with nothing to record (e.g. app_mention,
// which is really just a `message` with extra routing) is a deliberate
// no-op here rather than an attempt to mirror every Slack event verbatim.
async function dispatchEvent(
  ctx: GenericActionCtx<GenericDataModel>,
  component: ComponentApi,
  body: Record<string, unknown>,
): Promise<void> {
  const event = body.event as Record<string, unknown> | undefined;
  if (!event) return;
  const teamId = String(body.team_id ?? "");
  const eventType = String(event.type ?? "");

  if (eventType === "message") {
    const subtype = event.subtype as string | undefined;
    const channel = String(event.channel ?? "");

    if (subtype === "message_changed") {
      const message = event.message as Record<string, unknown> | undefined;
      if (message) {
        await ctx.runMutation(component.lib.patchMessageEdited, {
          teamId,
          channelId: channel,
          ts: String(message.ts),
          text: (message.text as string | undefined) ?? undefined,
        });
      }
      return;
    }

    if (subtype === "message_deleted") {
      const deletedTs = event.deleted_ts as string | undefined;
      if (deletedTs) {
        await ctx.runMutation(component.lib.markMessageDeleted, { teamId, channelId: channel, ts: deletedTs });
      }
      return;
    }

    // A plain new message, or a bot_message subtype -- both are worth
    // recording; other subtypes (channel_join, channel_topic, etc. --
    // Slack's system messages) are skipped, matching this component's
    // "sync what's actually a message a human or bot sent" scope.
    if (!subtype || subtype === "bot_message") {
      await ctx.runMutation(component.lib.recordMessage, {
        teamId,
        channelId: channel,
        ts: String(event.ts),
        threadTs: (event.thread_ts as string | undefined) ?? undefined,
        userId: (event.user as string | undefined) ?? undefined,
        botId: (event.bot_id as string | undefined) ?? undefined,
        text: (event.text as string | undefined) ?? undefined,
        isBotMessage: Boolean(event.bot_id),
      });
    }
    return;
  }

  if (eventType === "reaction_added" || eventType === "reaction_removed") {
    const item = event.item as Record<string, unknown> | undefined;
    if (item && item.type === "message") {
      await ctx.runMutation(component.lib.applyReactionDelta, {
        teamId,
        channelId: String(item.channel),
        ts: String(item.ts),
        reaction: String(event.reaction),
        userId: String(event.user),
        added: eventType === "reaction_added",
      });
    }
    return;
  }

  if (eventType === "member_joined_channel" || eventType === "member_left_channel") {
    // Track the bot's own membership specifically -- see channels.botIsMember's
    // doc comment in schema.ts. Other members joining/leaving isn't modeled
    // as a table of its own; conversations.members is the source of truth
    // for "who's in this channel" and this component doesn't try to
    // shadow it.
    const authorizations = body.authorizations as Array<Record<string, unknown>> | undefined;
    const botUserId = authorizations?.[0]?.user_id as string | undefined;
    if (botUserId && event.user === botUserId) {
      await ctx.runMutation(component.lib.upsertChannel, {
        teamId,
        channelId: String(event.channel),
        botIsMember: eventType === "member_joined_channel",
      });
    }
    return;
  }

  if (eventType === "channel_created" || eventType === "channel_rename") {
    const channel = event.channel as Record<string, unknown> | undefined;
    if (channel) {
      await ctx.runMutation(component.lib.upsertChannel, {
        teamId,
        channelId: String(channel.id),
        name: (channel.name as string | undefined) ?? undefined,
        isPrivate: (channel.is_private as boolean | undefined) ?? undefined,
      });
    }
    return;
  }

  if (eventType === "channel_archive" || eventType === "channel_unarchive") {
    await ctx.runMutation(component.lib.upsertChannel, {
      teamId,
      channelId: String(event.channel),
      isArchived: eventType === "channel_archive",
    });
    return;
  }

  if (eventType === "user_change" || eventType === "team_join") {
    const user = event.user as Record<string, unknown> | undefined;
    if (user) {
      const profile = user.profile as Record<string, unknown> | undefined;
      await ctx.runMutation(component.lib.upsertUser, {
        teamId,
        userId: String(user.id),
        name: (user.name as string | undefined) ?? undefined,
        realName: (user.real_name as string | undefined) ?? undefined,
        displayName: (profile?.display_name as string | undefined) ?? undefined,
        email: (profile?.email as string | undefined) ?? undefined,
        isBot: (user.is_bot as boolean | undefined) ?? undefined,
        isAdmin: (user.is_admin as boolean | undefined) ?? undefined,
        deleted: (user.deleted as boolean | undefined) ?? undefined,
      });
    }
    return;
  }

  if (eventType === "app_uninstalled" || eventType === "tokens_revoked") {
    // tokens_revoked can name specific users/bots rather than the whole
    // install, but for a single-bot-token-per-workspace component like
    // this one, either event means the stored token is no longer good --
    // safest is to mark the whole installation uninstalled and let a
    // fresh OAuth flow re-establish it.
    if (teamId) {
      await ctx.runMutation(component.lib.markInstallationUninstalled, { teamId });
    }
    return;
  }

  if (eventType === "scheduled_message_sent" || eventType === "scheduled_message_failed") {
    const scheduledMessageId = event.scheduled_message_id as string | undefined;
    if (scheduledMessageId) {
      await ctx.runMutation(component.lib.patchScheduledMessageStatus, {
        scheduledMessageId,
        status: eventType === "scheduled_message_sent" ? "sent" : "deleted",
      });
    }
    return;
  }
}

type RunQueryCtx = {
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"];
};

// Nearly every method above needs both: it resolves/refreshes a token via
// runQuery (+ a runMutation when it rotates), then records the result of
// the Web API call it made via runMutation. Same minimal-structural-type
// rationale as convex-livekit's RunMutationCtx: this accepts any real
// app's ActionCtx without requiring GenericDataModel to match exactly.
type RunMutationCtx = {
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
};
