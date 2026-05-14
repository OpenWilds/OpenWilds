# Convex Typed ECS Architecture

## Summary

Convex can support an ECS-style game layer, but the best fit for this project
is a typed ECS rather than a fully generic entity/component store. In practice,
that means Convex tables act as typed component stores, stable keys identify
entities, and small Convex mutations act as gameplay systems.

This proposal keeps Convex as the shared read model for multiple backends while
allowing Convex-native worlds to run gameplay systems directly in Convex.
MagicBlock, Solana, and MUD do not need to implement these Convex-only systems.
They can continue to normalize their state into the same read model through
`game/ingest.ts`.

## Goals

- Keep `gameWorlds` as the world registry and backend selector.
- Keep the current frontend read shape from `game/readModel.ts` stable.
- Add Convex gameplay systems only for worlds where `writeBackend` is
  `"convex"`.
- Model components as typed, indexed Convex tables instead of one generic
  component table.
- Keep gameplay rules small, testable, and easy to replace.

## ECS Mapping

| ECS concept | Convex shape |
| --- | --- |
| World | `gameWorlds` document keyed by `worldKey` |
| Entity | Stable domain key, such as `playerKey`, `tileKey`, or `offer` |
| Component | Typed table row scoped by `worldId` and entity key |
| System | Convex mutation that reads required components and patches results |
| Query/view | `game/readModel.ts` projection consumed by the client |
| External sync | Indexers calling `game/ingest.ts` with `source`, `revision`, and `updatedAt` |

The existing tables already lean in this direction:

- `gamePlayers` is the player identity/appearance component.
- `gamePlayerStates` contains position, energy, and active action for a player.
- `gameInventories` contains player inventory.
- `gameGoldBalances` contains player currency.
- `gameFarmTiles` contains farm state for a tile entity.
- `gameTileItems` contains item drops for a tile entity.
- `gameTradeOffers` contains trade-offer state.

These tables should stay typed and indexed. New component kinds should generally
be added as new typed tables when they need their own indexes, lifecycle, or
write frequency.

## Backend Boundaries

Convex should support mixed read/write backends, not replace every backend with
one ECS runtime.

- `gameWorlds.writeBackend === "convex"` means public Convex gameplay
  mutations are allowed to update component tables.
- `gameWorlds.writeBackend === "magicblock"` means gameplay writes are sent to
  MagicBlock/Solana, then indexers mirror state into Convex.
- `gameWorlds.writeBackend === "mud"` means gameplay writes are sent to MUD,
  then MUD indexers mirror state into Convex.
- `game/readModel.ts` remains the public read surface regardless of write
  backend.
- `game/ingest.ts` remains the normalization boundary for external backends and
  for shared upsert helpers.

This preserves the current frontend architecture: the Phaser layer consumes
`GameReadAdapter` streams and calls `GameWriteAdapter` commands without needing
to know whether the implementation is Convex, MagicBlock, MUD, or a mix.

## Proposed Module Layout

Future implementation can introduce Convex systems without moving the current
read model:

```text
convex/game/
  readModel.ts       # public reads, unchanged surface
  ingest.ts          # external/indexer normalization and shared upserts
  queries.ts         # indexed component lookups
  validators.ts      # public/internal function validators
  systems/
    guards.ts        # world/backend/player ownership checks
    movement.ts      # movePlayer
    rest.ts          # sleepPlayer
    tileActions.ts   # performTileAction
    trades.ts        # createTradeOffer, acceptTradeOffer, cancel/finalize
```

Public Convex system mutations should live under `game/systems/*` and use
validators from `game/validators.ts`. Sensitive helper mutations should remain
internal.

## Mini-System Pattern

A Convex gameplay system should be one small transaction:

1. Resolve the world by `worldKey`.
2. Require `world.writeBackend === "convex"`.
3. Resolve the acting player from authenticated identity or a server-trusted
   session model.
4. Read only the required component rows by indexed lookup.
5. Validate game rules.
6. Patch or insert only the affected component rows.
7. Return the same domain result expected by `GameWriteAdapter`.

Systems should not call several mutations to complete one command. Convex
mutations are already transactions, so the system should directly read and patch
the required component documents in one handler where possible.

### `movePlayer`

Required components:

- `gamePlayers`
- `gamePlayerStates`

Behavior:

- Require a Convex-write world.
- Require the target point to be in bounds.
- Require no active action is currently in progress.
- Calculate movement distance and energy cost.
- Patch `position`, `energy`, `activeAction`, `source: "convex"`,
  `revision`, and `updatedAt` on `gamePlayerStates`.
- Return `PlayerActionState`.

### `sleepPlayer`

Required components:

- `gamePlayers`
- `gamePlayerStates`

Behavior:

- Require a Convex-write world.
- Restore energy to max.
- Set `activeAction` to a sleep action or directly back to idle, depending on
  the desired client animation.
- Patch `source: "convex"`, `revision`, and `updatedAt`.
- Return `PlayerActionState`.

### `performTileAction`

Required components depend on action mode:

- Common: `gamePlayers`, `gamePlayerStates`.
- Farming: `gameFarmTiles`.
- Drop/grab: `gameInventories`, `gameTileItems`.

Behavior:

- Treat `move` as a call path equivalent to `movePlayer`.
- For `till`, `water`, `plant`, and `harvest`, patch one tile component and the
  player's action state.
- For `drop`, move quantity from inventory to a tile item component.
- For `grab`, move quantity from tile item component to inventory.
- Return `{ player, tile }` or `{ player, item }` in the existing
  `ActionResult` shape.

### `createTradeOffer`

Required components:

- Buyer player identity/state.
- Seller player identity.
- Buyer's gold balance.
- Seller inventory, if Convex is authoritative for inventory transfers at offer
  creation time.

Behavior:

- Require a Convex-write world.
- Validate buyer/seller and amounts.
- Insert `gameTradeOffers` with status `"open"`.
- Use an indexed `offer` key for lookup.
- Return `null` or a small acknowledgement, matching the current
  `GameWriteAdapter` command.

### `acceptTradeOffer`

Required components:

- `gameTradeOffers`.
- Seller player identity.

Behavior:

- Require a Convex-write world.
- Require status `"open"` and non-expired offer.
- Patch status to `"accepted"` and optionally set `acceptance`.
- Keep final settlement in `finalizeTradeOffer` so the transfer is explicit.

## Public Interface

The frontend contract should stay aligned with `app/src/game/ports.ts`:

```ts
type GameWriteAdapter = {
  movePlayer(point): Promise<PlayerActionState | null>;
  sleepPlayer(): Promise<PlayerActionState | null>;
  performAction(mode, point, selectedItemId?, selectedQuantity?):
    Promise<ActionResult | null>;
  createTradeOffer(args): Promise<void>;
  acceptTradeOffer(offer): Promise<void>;
  cancelTradeOffer(offer): Promise<void>;
  finalizeTradeOffer(offer): Promise<void>;
};
```

A future Convex write adapter should call public Convex mutations that mirror
these commands. The adapter can then be composed with the existing Convex read
adapter or with another read backend during tests.

## Why Not a Generic Component Table?

A generic ECS table might look flexible:

```text
gameComponents:
  worldId
  entityKey
  componentKind
  payload
```

That shape is not the best first implementation for this Convex app.

- Convex validators work best when each table has a clear payload shape.
- Indexes must be declared ahead of time, so frequently queried components need
  typed indexes anyway.
- Typed tables make `Doc<"tableName">` and `Id<"tableName">` useful.
- Queries can use `withIndex` directly instead of scanning or filtering generic
  payloads.
- Read-model code stays simple and bounded.
- High-churn data can be isolated from stable data by table, reducing write
  contention.

A generic table can still be useful later for experimental or rare components,
but core gameplay state should stay typed.

## Implementation Phases

1. Keep the current schema and read model stable.
2. Add `game/systems/*` Convex mutations for `writeBackend === "convex"`.
3. Add a client-side Convex write adapter that implements `GameWriteAdapter`.
4. Reuse `game/ingest.ts` helpers where they fit, but keep complete gameplay
   commands in one mutation transaction.
5. Add new typed component tables only when a feature needs a distinct payload,
   index, lifecycle, or write frequency.

## Acceptance Tests

Future implementation should include tests that prove:

- Convex systems update only the component rows required by the command.
- Existing `getWorldReadModel` tests still pass.
- External stale revisions are still rejected by freshness checks.
- The Convex write adapter satisfies the existing game adapter contract tests.
- Mixed backend composition still works, including Convex reads with MagicBlock
  writes and Convex writes with Convex reads.

## Open Decisions

- The exact Convex auth/session model for authorizing player commands.
- Whether action timestamps use seconds, milliseconds, or a normalized helper
  across all Convex systems.
- Whether inventory should stay as bounded slots on one component row or split
  into per-slot rows if it becomes high churn or unbounded.
- Whether experimental components need a separate generic table after core
  gameplay systems are typed.
