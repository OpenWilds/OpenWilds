# Convex Architecture

Convex is split by product domain so Studio, runtime game state, and indexers
can grow independently.

## Domains

- `schema.ts` is the only Convex schema entrypoint. It composes table maps from
  `schema/studio.ts`, `schema/game.ts`, and `schema/indexers.ts`.
- `game/` owns runtime read models for worlds, players, inventory, gold, farm
  tiles, tile items, and trade offers.
- `studio.ts` and future `studio/` modules own design-time creator workflows,
  including maps, terrain assets, object sprites, plant sprites, and generation.
- `indexers/` normalizes external systems into `game/ingest.ts`. Indexers do
  not expose public client read APIs.
- `shared/` is for tiny helpers that are truly cross-domain.

## Rules

- Public frontend game reads should live in `game/readModel.ts`.
- Runtime writes from indexers or future Convex gameplay systems should go
  through `game/ingest.ts` so freshness handling stays centralized.
- Runtime read-model documents carry `source`, `revision`, and `updatedAt`.
  Older revisions are ignored; equal revisions are accepted for idempotent
  retries.
- Keep `gameState.ts` as a compatibility facade while callers migrate to the
  nested `game/*` modules.
- Keep unbounded runtime collections as separate indexed documents rather than
  arrays embedded in a world document.
