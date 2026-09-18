/* eslint-disable */
/**
 * Generated utilities for implementing server-side Convex query and mutation functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ActionBuilder,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

type Env = {
  readonly CONVEX_CLOUD_URL: string;
  readonly CONVEX_SITE_URL: string;
};

export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const internalQuery: QueryBuilder<DataModel, "internal"> =
  internalQueryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> =
  internalMutationGeneric;
export const action: ActionBuilder<DataModel, "public"> = actionGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> =
  internalActionGeneric;
export const httpAction: HttpActionBuilder = httpActionGeneric;
export const env: Env = (globalThis as unknown as { process: { env: Env } })
  .process.env;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
