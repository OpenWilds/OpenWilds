/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as game_defaults from "../game/defaults.js";
import type * as game_dev from "../game/dev.js";
import type * as game_freshness from "../game/freshness.js";
import type * as game_ingest from "../game/ingest.js";
import type * as game_queries from "../game/queries.js";
import type * as game_readModel from "../game/readModel.js";
import type * as game_validators from "../game/validators.js";
import type * as gameState from "../gameState.js";
import type * as indexers_magicblock_checkpoints from "../indexers/magicblock/checkpoints.js";
import type * as indexers_magicblock_types from "../indexers/magicblock/types.js";
import type * as schema_game from "../schema/game.js";
import type * as schema_indexers from "../schema/indexers.js";
import type * as schema_shared from "../schema/shared.js";
import type * as schema_studio from "../schema/studio.js";
import type * as shared_ids from "../shared/ids.js";
import type * as studio from "../studio.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "game/defaults": typeof game_defaults;
  "game/dev": typeof game_dev;
  "game/freshness": typeof game_freshness;
  "game/ingest": typeof game_ingest;
  "game/queries": typeof game_queries;
  "game/readModel": typeof game_readModel;
  "game/validators": typeof game_validators;
  gameState: typeof gameState;
  "indexers/magicblock/checkpoints": typeof indexers_magicblock_checkpoints;
  "indexers/magicblock/types": typeof indexers_magicblock_types;
  "schema/game": typeof schema_game;
  "schema/indexers": typeof schema_indexers;
  "schema/shared": typeof schema_shared;
  "schema/studio": typeof schema_studio;
  "shared/ids": typeof shared_ids;
  studio: typeof studio;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
