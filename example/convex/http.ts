import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { Slack, verifySlackSignature } from "../../src/client/index.js";
import { httpAction } from "./_generated/server";
import { invoiceModalView } from "./invoiceModal";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const http = httpRouter();

http.route({ path: "/slack/events", method: "POST", handler: slack.eventsHandler });

// The default `slack.interactivityHandler` just records every button click,
// modal submission, and shortcut invocation -- it doesn't know what any
// particular callback_id should *do*. To react to one (here: opening the
// invoice modal when the "Open invoice" shortcut fires) an app wraps the
// handler instead of mounting it directly, so it can call `slack.openView`
// with the same request's trigger_id before Slack's ~3s window closes.
const interactivityHandler = httpAction(async (ctx, request) => {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) {
    return new Response(JSON.stringify({ error: "Missing Slack signature headers" }), { status: 400 });
  }
  if (!(await verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, timestamp, rawBody, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payloadRaw = form.get("payload");
  if (!payloadRaw) return new Response(JSON.stringify({ error: "Missing payload" }), { status: 400 });
  const payload = JSON.parse(payloadRaw) as Record<string, unknown>;

  const teamId = String((payload.team as Record<string, unknown> | undefined)?.id ?? "");
  const userId = String((payload.user as Record<string, unknown> | undefined)?.id ?? "");
  const type = String(payload.type ?? "");
  const callbackId =
    (payload.callback_id as string | undefined) ??
    ((payload.view as Record<string, unknown> | undefined)?.callback_id as string | undefined);
  const triggerId = (payload.trigger_id as string | undefined) ?? undefined;

  if (teamId && userId && type) {
    const firstAction = Array.isArray(payload.actions) ? (payload.actions[0] as Record<string, unknown>) : undefined;
    await ctx.runMutation(components.convexSlack.lib.recordInteraction, {
      teamId,
      userId,
      type: type as "block_actions" | "view_submission" | "view_closed" | "shortcut" | "message_action",
      actionId: firstAction ? String(firstAction.action_id ?? "") || undefined : undefined,
      callbackId,
      triggerId,
      payload: payloadRaw,
    });
  }

  if (type === "shortcut" && callbackId === "open_invoice" && teamId && triggerId) {
    // Slack still needs this ack even if opening the modal fails (a
    // revoked install, an expired trigger_id, a transient API error) --
    // swallow the error rather than let it turn into a 500 the user's
    // shortcut click would otherwise appear to just silently eat.
    try {
      await slack.openView(ctx, { teamId, triggerId, view: invoiceModalView });
    } catch (err) {
      console.error("convex-slack example: failed to open invoice modal", err);
    }
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});

http.route({ path: "/slack/interactivity", method: "POST", handler: interactivityHandler });
http.route({ path: "/slack/commands", method: "POST", handler: slack.commandsHandler });

// Link an "Add to Slack" button at:
//   slack.getAuthorizationUrl({
//     redirectUri: `${process.env.CONVEX_SITE_URL}/slack/oauth/callback`,
//     scopes: ["chat:write", "channels:history", "channels:read", "reactions:read", "users:read"],
//   })
export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return new Response(`Slack authorization failed: ${error}`, { status: 400 });
  if (!code) return new Response("Missing code", { status: 400 });

  const { teamId } = await slack.exchangeCode(ctx, {
    code,
    redirectUri: `${process.env.CONVEX_SITE_URL}/slack/oauth/callback`,
  });

  return new Response(`Installed into workspace ${teamId}. You can close this tab.`);
});

http.route({ path: "/slack/oauth/callback", method: "GET", handler: oauthCallback });

export default http;
