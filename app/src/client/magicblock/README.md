# MagicBlock Client Architecture

This directory contains the MagicBlock implementation of the backend-neutral
game ports from `app/src/game/ports.ts`.

The important idea is that the game layer talks to three domain ports:

- `GameReadAdapter`: RxJS streams for player state, inventory, tiles, trades,
  and other read models.
- `GameWriteAdapter`: Promise-based commands for movement, sleep, world
  actions, and trades.
- `GameSessionAdapter`: boot, player selection, and player preparation.

MagicBlock is one concrete backend behind those ports. Future backends can
replace only the read side, only the write side, or the full backend without
changing Phaser scene code.

## Active Boot Path

The active app path is:

```text
app/src/main.ts
  -> createMagicBlockGameBackend(hud)
  -> createGameBackend({ read, write, session, state })
  -> Phaser receives backend.client
```

`createMagicBlockGameBackend` in `backend.ts` wires the current implementation:

```text
GameStateStore
MagicBlockNativeClientCore
MagicBlockAgentSessionService
MagicBlockControlBinder
MagicBlockReadService -> MagicBlockReadAdapter
MagicBlockWriteService -> MagicBlockWriteAdapter
MagicBlockSessionService -> MagicBlockSessionAdapter
```

`legacy-client-core.ts` is not part of this active path.

## Runtime Shape

The current runtime is transitional:

- The public game boundary is already split into read/write/session ports.
- `MagicBlockNativeClientCore` still owns much of the concrete MagicBlock
  behavior while that logic is gradually drained into focused services.
- The active backend no longer imports or instantiates `legacy-client-core.ts`.
- `client-core.ts` is compatibility-only for old callers that still expect the
  previous client class shape.

This gives us a safe migration path: game-facing interfaces are stable now, and
the remaining MagicBlock internals can be extracted without touching Phaser.

## Data Flow

### Reads

```text
MagicBlockNativeClientCore callbacks
  -> MagicBlockReadService
  -> GameStateStore BehaviorSubjects
  -> GameReadAdapter RxJS streams
  -> Phaser/HUD consumers
```

`GameStateStore` is backend-neutral. It gives every backend predictable initial
values and filters duplicate emissions with stable equality. MagicBlock reads
currently bridge runtime callback subscriptions into this shared store.

### Writes

```text
Phaser calls backend.client.movePlayer(...)
  -> MagicBlockWriteAdapter
  -> MagicBlockWriteService
  -> MagicBlockActionWriter or MagicBlockTradeWriter
  -> MagicBlockNativeClientCore
  -> MagicBlockRuntimeContext / Solana + MagicBlock RPCs
```

Writes return the same domain shapes Phaser expects today. Gameplay writes still
preserve the current MagicBlock routing and confirmation behavior.

### Session

```text
main.ts calls backend.session.boot()
  -> MagicBlockSessionAdapter
  -> MagicBlockSessionService
  -> MagicBlockNativeClientCore
  -> selected-player state is mirrored into GameStateStore
```

Player preparation is separate from boot. `main.ts` only starts Phaser after
`backend.session.prepareSelectedPlayer()` succeeds.

### DOM Controls

```text
HudController.elements
  -> MagicBlockControlBinder
  -> session/write/runtime services
```

`MagicBlockControlBinder` is the active module that attaches MagicBlock DOM
event listeners. Runtime boot does not bind controls. Agent Mode command inputs
are read by the binder and passed into `MagicBlockAgentSessionService`.

## MagicBlock Routing Rules

Keep routing explicit when moving more logic out of `native-client-core.ts`:

- Base layer connection: setup, provisioning, player NFT mint/select, starter
  inventory, starter gold, player-owner sync, program checks, trade setup, agent
  grant/revoke, and localnet airdrop.
- Ephemeral Rollup connection: gameplay writes on delegated components,
  delegated account reads, and ER-side confirmation reads.
- ER transactions keep the existing `skipPreflight` behavior where gameplay
  commands already use it.
- Read paths should prefer the freshest ER/base state when both exist.

## Module Catalog

| Module                     | Role                                                                                                                                                                                                                 | Active path   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `backend.ts`               | MagicBlock backend factory. Composes state, runtime, services, adapters, and control binder into a `GameBackend`.                                                                                                    | Yes           |
| `native-client-core.ts`    | Transitional native MagicBlock runtime. Owns current wallet/session state, account polling, provisioning helpers, gameplay transactions, trade transactions, commits, and HUD status calls while logic is extracted. | Yes           |
| `runtime-context.ts`       | Shared runtime infrastructure for base/ER connections, burner wallet, Anchor provider installation, and signed transaction sending.                                                                                  | Yes           |
| `program-registry.ts`      | Base-layer deployed-program registry. Reads program infos and throws `MissingProgramsError` when required programs are absent.                                                                                       | Yes           |
| `account-reader.ts`        | Named account-reading boundary for base/ER account access. Currently extends `MagicBlockStateReader`.                                                                                                                | Yes           |
| `state-reader.ts`          | Raw account decode helpers and freshest player action-state selection. Also has a small reader for player action accounts.                                                                                           | Yes           |
| `decoders.ts`              | Pure decoder export surface. Tests and future services should import decoder helpers here instead of from runtime code.                                                                                              | Yes           |
| `read-service.ts`          | Bridges runtime callback subscriptions into `GameStateStore` and exposes RxJS read streams.                                                                                                                          | Yes           |
| `read-adapter.ts`          | Thin `GameReadAdapter` wrapper around the read service.                                                                                                                                                              | Yes           |
| `write-service.ts`         | Combines gameplay and trade writers behind `GameWriteAdapter`.                                                                                                                                                       | Yes           |
| `write-adapter.ts`         | Thin `GameWriteAdapter` wrapper around the write service.                                                                                                                                                            | Yes           |
| `action-writer.ts`         | Gameplay command boundary for movement, sleep, and world/tile/item actions. Currently delegates to the native runtime.                                                                                               | Yes           |
| `trade-writer.ts`          | Trade command boundary for create, accept, cancel, and finalize. Currently delegates to the native runtime.                                                                                                          | Yes           |
| `session-service.ts`       | Session orchestration for boot, selected-player stream bridging, and selected-player preparation.                                                                                                                    | Yes           |
| `session-adapter.ts`       | Thin `GameSessionAdapter` wrapper around the session service.                                                                                                                                                        | Yes           |
| `provisioning-service.ts`  | Player provisioning boundary for `prepareSelectedPlayer`. Currently delegates to the native runtime while provisioning code is extracted.                                                                            | Yes           |
| `agent-session-service.ts` | Agent Mode service for status, grant, and revoke commands. Receives delegate and prepared transaction values from the binder.                                                                                        | Yes           |
| `control-binder.ts`        | DOM control boundary. Attaches HUD listeners for airdrop, sleep, commit, mint/select/reset, and Agent Mode controls.                                                                                                 | Yes           |
| `client-core.ts`           | Compatibility facade that preserves the older `MagicBlockClientCore` class shape while using the native runtime and new services internally. New app code should use `backend.ts`.                                   | Compatibility |
| `legacy-client-core.ts`    | Preserved old monolithic client. It remains in the repo temporarily for reference/rollback while the native path stabilizes.                                                                                         | No            |
| `state-reader.test.ts`     | Unit tests for decoder/freshest-state behavior.                                                                                                                                                                      | Test          |

## Active Responsibilities By Layer

### Backend Factory

`backend.ts` is the only place that should know which concrete MagicBlock
pieces are used together. A future mixed backend should be created by a new
factory, for example:

```text
ConvexReadAdapter + MagicBlockWriteAdapter + MagicBlockSessionAdapter
```

The generic `createGameBackend` function already supports that composition.

### Services

Services are the orchestration layer. They should own meaningful backend
behavior and hide runtime details from adapters:

- `MagicBlockReadService`: read stream orchestration.
- `MagicBlockWriteService`: write command orchestration.
- `MagicBlockSessionService`: boot and selected-player lifecycle.
- `MagicBlockProvisioningService`: player/world setup boundary.
- `MagicBlockAgentSessionService`: Agent Mode command lifecycle.

### Adapters

Adapters should stay thin. Their job is to satisfy public game ports, not to
contain transaction logic.

### Runtime Infrastructure

Runtime infrastructure modules should be reusable by future MagicBlock services:

- `MagicBlockRuntimeContext` for connections, wallet, provider, and tx sending.
- `MagicBlockProgramRegistry` for program deployment checks.
- `MagicBlockAccountReader` and decoder helpers for account reads.

## Current Transitional Boundaries

Some behavior is intentionally still inside `MagicBlockNativeClientCore`:

- Movement, sleep, farm actions, grab/drop, and trade transaction bodies.
- Player NFT mint/select/reset details.
- Account polling and subscription details.
- HUD status calls used by current MagicBlock flows.
- Commit and localnet utility commands.

The next extraction steps should move concrete transaction bodies from
`native-client-core.ts` into:

- `MagicBlockActionWriter`
- `MagicBlockTradeWriter`
- `MagicBlockProvisioningService`
- a future dedicated session/context module for wallet/player state

Do this incrementally so routing stays correct and localnet behavior remains
unchanged.

## How To Test

Fast frontend contract and decoder tests:

```bash
pnpm test:app
```

Production app build:

```bash
pnpm build
```

Formatting check:

```bash
pnpm lint
```

Manual MagicBlock smoke test:

```text
boot
mint or select player
start game
move
sleep
till / plant / chop
grab / drop
trade
commit
```

When testing MagicBlock behavior, confirm that base-layer operations still use
the base connection and delegated gameplay writes still use the ER connection.
