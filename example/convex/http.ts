import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { Slack } from "../../src/client/index.js";
import { httpAction } from "./_generated/server";

const slack = new Slack(components.convexSlack, {
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const http = httpRouter();

http.route({ path: "/slack/events", method: "POST", handler: slack.eventsHandler });
http.route({ path: "/slack/interactivity", method: "POST", handler: slack.interactivityHandler });
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
