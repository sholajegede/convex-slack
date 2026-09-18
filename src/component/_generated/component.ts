/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      applyReactionDelta: FunctionReference<
        "mutation",
        "internal",
        {
          added: boolean;
          channelId: string;
          reaction: string;
          teamId: string;
          ts: string;
          userId: string;
        },
        null,
        Name
      >;
      checkAndRecordEvent: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          eventType: string;
          payload: string;
          teamId?: string;
        },
        { alreadyProcessed: boolean },
        Name
      >;
      getChannel: FunctionReference<
        "query",
        "internal",
        { channelId: string; teamId: string },
        {
          _creationTime: number;
          _id: string;
          botIsMember?: boolean;
          channelId: string;
          createdAt: number;
          isArchived?: boolean;
          isIm?: boolean;
          isMpim?: boolean;
          isPrivate?: boolean;
          name?: string;
          purpose?: string;
          teamId: string;
          topic?: string;
          updatedAt: number;
        } | null,
        Name
      >;
      getInstallation: FunctionReference<
        "query",
        "internal",
        { teamId: string },
        {
          _creationTime: number;
          _id: string;
          appId: string;
          authedUserId: string;
          botRefreshToken?: string;
          botScope: string;
          botToken: string;
          botTokenExpiresAt?: number;
          botUserId: string;
          enterpriseId?: string;
          incomingWebhookChannel?: string;
          incomingWebhookChannelId?: string;
          incomingWebhookUrl?: string;
          installedAt: number;
          teamId: string;
          teamName?: string;
          uninstalledAt?: number;
          updatedAt: number;
        } | null,
        Name
      >;
      getMessage: FunctionReference<
        "query",
        "internal",
        { channelId: string; teamId: string; ts: string },
        {
          _creationTime: number;
          _id: string;
          botId?: string;
          channelId: string;
          createdAt: number;
          deletedAt?: number;
          editedAt?: number;
          isBotMessage: boolean;
          teamId: string;
          text?: string;
          threadTs?: string;
          ts: string;
          updatedAt: number;
          userId?: string;
        } | null,
        Name
      >;
      getStats: FunctionReference<
        "query",
        "internal",
        {},
        {
          channels: number;
          commands: number;
          files: number;
          installations: number;
          interactions: number;
          messages: number;
          users: number;
        },
        Name
      >;
      getUser: FunctionReference<
        "query",
        "internal",
        { teamId: string; userId: string },
        {
          _creationTime: number;
          _id: string;
          deleted?: boolean;
          displayName?: string;
          email?: string;
          isAdmin?: boolean;
          isBot?: boolean;
          name?: string;
          realName?: string;
          teamId: string;
          updatedAt: number;
          userId: string;
        } | null,
        Name
      >;
      listChannels: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          botIsMember?: boolean;
          channelId: string;
          createdAt: number;
          isArchived?: boolean;
          isIm?: boolean;
          isMpim?: boolean;
          isPrivate?: boolean;
          name?: string;
          purpose?: string;
          teamId: string;
          topic?: string;
          updatedAt: number;
        }>,
        Name
      >;
      listCommandsByTeam: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          channelId?: string;
          command: string;
          receivedAt: number;
          responseUrl?: string;
          teamId: string;
          text?: string;
          triggerId?: string;
          userId: string;
        }>,
        Name
      >;
      listFilesByTeam: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          channelId?: string;
          fileId: string;
          mimetype?: string;
          name?: string;
          permalink?: string;
          size?: number;
          teamId: string;
          title?: string;
          ts?: string;
          uploadedAt: number;
          url?: string;
        }>,
        Name
      >;
      listInstallations: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          appId: string;
          authedUserId: string;
          botRefreshToken?: string;
          botScope: string;
          botToken: string;
          botTokenExpiresAt?: number;
          botUserId: string;
          enterpriseId?: string;
          incomingWebhookChannel?: string;
          incomingWebhookChannelId?: string;
          incomingWebhookUrl?: string;
          installedAt: number;
          teamId: string;
          teamName?: string;
          uninstalledAt?: number;
          updatedAt: number;
        }>,
        Name
      >;
      listInteractionsByTeam: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          actionId?: string;
          callbackId?: string;
          payload: string;
          receivedAt: number;
          teamId: string;
          triggerId?: string;
          type:
            | "block_actions"
            | "view_submission"
            | "view_closed"
            | "shortcut"
            | "message_action";
          userId: string;
        }>,
        Name
      >;
      listMessagesByChannel: FunctionReference<
        "query",
        "internal",
        { channelId: string; limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          botId?: string;
          channelId: string;
          createdAt: number;
          deletedAt?: number;
          editedAt?: number;
          isBotMessage: boolean;
          teamId: string;
          text?: string;
          threadTs?: string;
          ts: string;
          updatedAt: number;
          userId?: string;
        }>,
        Name
      >;
      listMessagesByThread: FunctionReference<
        "query",
        "internal",
        { channelId: string; limit?: number; teamId: string; threadTs: string },
        Array<{
          _creationTime: number;
          _id: string;
          botId?: string;
          channelId: string;
          createdAt: number;
          deletedAt?: number;
          editedAt?: number;
          isBotMessage: boolean;
          teamId: string;
          text?: string;
          threadTs?: string;
          ts: string;
          updatedAt: number;
          userId?: string;
        }>,
        Name
      >;
      listReactionsByMessage: FunctionReference<
        "query",
        "internal",
        { channelId: string; teamId: string; ts: string },
        Array<{
          _creationTime: number;
          _id: string;
          channelId: string;
          reaction: string;
          teamId: string;
          ts: string;
          updatedAt: number;
          userIds: Array<string>;
        }>,
        Name
      >;
      listRecentWebhookEvents: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          eventId: string;
          eventType: string;
          payload: string;
          receivedAt: number;
          teamId?: string;
        }>,
        Name
      >;
      listScheduledMessagesByTeam: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          channelId: string;
          createdAt: number;
          postAt: number;
          scheduledMessageId: string;
          status: "scheduled" | "sent" | "deleted";
          teamId: string;
          text?: string;
          updatedAt: number;
        }>,
        Name
      >;
      listUsers: FunctionReference<
        "query",
        "internal",
        { limit?: number; teamId: string },
        Array<{
          _creationTime: number;
          _id: string;
          deleted?: boolean;
          displayName?: string;
          email?: string;
          isAdmin?: boolean;
          isBot?: boolean;
          name?: string;
          realName?: string;
          teamId: string;
          updatedAt: number;
          userId: string;
        }>,
        Name
      >;
      markInstallationUninstalled: FunctionReference<
        "mutation",
        "internal",
        { teamId: string },
        null,
        Name
      >;
      markMessageDeleted: FunctionReference<
        "mutation",
        "internal",
        { channelId: string; teamId: string; ts: string },
        null,
        Name
      >;
      patchInstallationToken: FunctionReference<
        "mutation",
        "internal",
        {
          botRefreshToken?: string;
          botToken: string;
          botTokenExpiresAt?: number;
          teamId: string;
        },
        null,
        Name
      >;
      patchMessageEdited: FunctionReference<
        "mutation",
        "internal",
        { channelId: string; teamId: string; text?: string; ts: string },
        null,
        Name
      >;
      patchScheduledMessageStatus: FunctionReference<
        "mutation",
        "internal",
        {
          scheduledMessageId: string;
          status: "scheduled" | "sent" | "deleted";
        },
        null,
        Name
      >;
      recordCommand: FunctionReference<
        "mutation",
        "internal",
        {
          channelId?: string;
          command: string;
          responseUrl?: string;
          teamId: string;
          text?: string;
          triggerId?: string;
          userId: string;
        },
        string,
        Name
      >;
      recordFile: FunctionReference<
        "mutation",
        "internal",
        {
          channelId?: string;
          fileId: string;
          mimetype?: string;
          name?: string;
          permalink?: string;
          size?: number;
          teamId: string;
          title?: string;
          ts?: string;
          url?: string;
        },
        string,
        Name
      >;
      recordInteraction: FunctionReference<
        "mutation",
        "internal",
        {
          actionId?: string;
          callbackId?: string;
          payload: string;
          teamId: string;
          triggerId?: string;
          type:
            | "block_actions"
            | "view_submission"
            | "view_closed"
            | "shortcut"
            | "message_action";
          userId: string;
        },
        string,
        Name
      >;
      recordMessage: FunctionReference<
        "mutation",
        "internal",
        {
          botId?: string;
          channelId: string;
          isBotMessage: boolean;
          teamId: string;
          text?: string;
          threadTs?: string;
          ts: string;
          userId?: string;
        },
        string,
        Name
      >;
      recordScheduledMessage: FunctionReference<
        "mutation",
        "internal",
        {
          channelId: string;
          postAt: number;
          scheduledMessageId: string;
          teamId: string;
          text?: string;
        },
        string,
        Name
      >;
      upsertChannel: FunctionReference<
        "mutation",
        "internal",
        {
          botIsMember?: boolean;
          channelId: string;
          isArchived?: boolean;
          isIm?: boolean;
          isMpim?: boolean;
          isPrivate?: boolean;
          name?: string;
          purpose?: string;
          teamId: string;
          topic?: string;
        },
        string,
        Name
      >;
      upsertInstallation: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          authedUserId: string;
          botRefreshToken?: string;
          botScope: string;
          botToken: string;
          botTokenExpiresAt?: number;
          botUserId: string;
          enterpriseId?: string;
          incomingWebhookChannel?: string;
          incomingWebhookChannelId?: string;
          incomingWebhookUrl?: string;
          teamId: string;
          teamName?: string;
        },
        string,
        Name
      >;
      upsertUser: FunctionReference<
        "mutation",
        "internal",
        {
          deleted?: boolean;
          displayName?: string;
          email?: string;
          isAdmin?: boolean;
          isBot?: boolean;
          name?: string;
          realName?: string;
          teamId: string;
          userId: string;
        },
        string,
        Name
      >;
    };
  };
