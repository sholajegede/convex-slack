import { defineSchema } from "convex/server";

// The example app has no tables of its own — everything it demonstrates
// (installations, channels, messages, reactions, interactions, commands,
// files, scheduled messages) lives inside convex-slack's own isolated
// component schema, reached only through the Slack client's methods.
export default defineSchema({});
