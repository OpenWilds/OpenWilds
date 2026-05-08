import Phaser from "phaser";
import { createBoard } from "./board";
import { createHoverEntity, createPlayerEntity } from "./entities/index";
import { World } from "./ecs";
import { createFarmCatalog } from "./farm-catalog";
import { FARM_TYPES, FarmKind } from "./farm";
import { GAME_HEIGHT, GAME_WIDTH } from "./grid-constants";
import { CELL_SIZE, GRID_ORIGIN_X, GRID_ORIGIN_Y } from "./grid-constants";
import { pointerToGrid } from "./grid-math";
import { installGridResources, type GridInput } from "./resources";
import { beginActionTransition } from "./systems/action-transition";
import { gridSystems } from "./systems/index";
import { Components, type RectComponent } from "./components/index";
import type {
  GameClient,
  FarmActionMode,
  FarmTileState,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  VisiblePlayerState,
} from "./types";

export { GAME_HEIGHT, GAME_WIDTH };

export const createGridScene = (client: GameClient) =>
  class GridScene extends Phaser.Scene {
    private world!: World;
    private unsubscribePlayerActionState: (() => void) | null = null;
    private unsubscribePlayerAppearance: (() => void) | null = null;
    private unsubscribeVisiblePlayers: (() => void) | null = null;
    private unsubscribeInventory: (() => void) | null = null;
    private farmCatalog: ReturnType<typeof createFarmCatalog> | null = null;
    private activePlayerEntity: number | null = null;
    private farmActionPending = false;
    private readonly farmTileGraphics = new Map<string, Phaser.GameObjects.Graphics>();
    private readonly remotePlayerEntities = new Map<string, number>();
    private readonly remotePlayerStateKeys = new Map<string, string>();

    constructor() {
      super("grid-scene");
    }

    create() {
      this.cameras.main.setBackgroundColor("#f6f2e8");
      this.world = new World();

      installGridResources(this.world, this, client);
      createBoard(this);
      this.farmCatalog = createFarmCatalog(
        this,
        (mode) => {
          this.gridInput.farmActionMode = mode;
        },
        (itemId) => {
          this.gridInput.selectedItemId = itemId;
        }
      );
      createHoverEntity(this.world, this);
      const player = createPlayerEntity(this.world, this, { x: 10, y: 10 });
      this.activePlayerEntity = player;
      this.bindPlayerActionState(player);

      for (const system of gridSystems) {
        this.world.addSystem(system);
      }

      this.world.update(0);
      this.bindPointerInput();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribePlayerActionState?.();
        this.unsubscribePlayerActionState = null;
        this.unsubscribePlayerAppearance?.();
        this.unsubscribePlayerAppearance = null;
        this.unsubscribeVisiblePlayers?.();
        this.unsubscribeVisiblePlayers = null;
        this.unsubscribeInventory?.();
        this.unsubscribeInventory = null;
      });
    }

    update(_time: number, delta: number) {
      this.world.update(delta);
    }

    private bindPointerInput() {
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        this.gridInput.hoverPoint = pointerToGrid(pointer);
      });

      this.input.on("pointerout", () => {
        this.gridInput.hoverPoint = null;
      });

      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const point = pointerToGrid(pointer);

        if (this.gridInput.farmActionMode === "move") {
          this.gridInput.requestedMove = point;
          return;
        }

        void this.performFarmAction(this.gridInput.farmActionMode, point);
      });
    }

    private get gridInput() {
      return this.world.requireResource<GridInput>("input");
    }

    private bindPlayerActionState(player: number) {
      this.unsubscribePlayerActionState =
        client.subscribePlayerActionState?.((state) =>
          this.applyPlayerActionState(player, state)
        ) ?? null;
      this.unsubscribePlayerAppearance =
        client.subscribePlayerAppearance?.((appearance) =>
          this.applyPlayerAppearance(player, appearance)
        ) ?? null;
      this.unsubscribeVisiblePlayers =
        client.subscribeVisiblePlayers?.((players) =>
          this.applyVisiblePlayers(players)
        ) ?? null;
      this.unsubscribeInventory =
        client.subscribeInventory?.((inventory) =>
          this.applyInventory(inventory)
        ) ?? null;
    }

    private applyPlayerActionState(player: number, state: PlayerActionState) {
      beginActionTransition(this.world, player, state);
    }

    private applyPlayerAppearance(
      player: number,
      appearance: PlayerAppearance
    ) {
      const rectangle = this.world.getComponent<RectComponent>(
        player,
        Components.rectangle
      );

      rectangle?.object
        .setFillStyle(appearance.fill)
        .setStrokeStyle(3, appearance.stroke);
    }

    private applyVisiblePlayers(players: VisiblePlayerState[]) {
      const visibleRemoteMints = new Set<string>();

      for (const player of players) {
        if (player.isActive) {
          continue;
        }

        visibleRemoteMints.add(player.mint);
        const entity =
          this.remotePlayerEntities.get(player.mint) ??
          this.createRemotePlayerEntity(player);
        const stateKey = this.getPlayerStateKey(player.state);

        this.applyPlayerAppearance(entity, player.appearance);
        if (this.remotePlayerStateKeys.get(player.mint) === stateKey) {
          continue;
        }

        this.remotePlayerStateKeys.set(player.mint, stateKey);
        beginActionTransition(this.world, entity, player.state);
      }

      for (const [mint, entity] of this.remotePlayerEntities) {
        if (visibleRemoteMints.has(mint)) {
          continue;
        }

        this.world
          .getComponent<RectComponent>(entity, Components.rectangle)
          ?.object.setVisible(false);
        this.remotePlayerEntities.delete(mint);
        this.remotePlayerStateKeys.delete(mint);
      }
    }

    private applyInventory(inventory: InventoryState) {
      this.farmCatalog?.updateInventory(inventory);
    }

    private async performFarmAction(mode: FarmActionMode, point: { x: number; y: number }) {
      if (this.farmActionPending || !client.performFarmAction) {
        return;
      }

      this.farmActionPending = true;
      try {
        const result = await client.performFarmAction(
          mode,
          point,
          this.gridInput.selectedItemId
        );

        if (!result) {
          return;
        }

        if (this.activePlayerEntity !== null) {
          beginActionTransition(this.world, this.activePlayerEntity, result.player);
        }

        this.drawFarmTile(result.tile);
      } finally {
        this.farmActionPending = false;
      }
    }

    private drawFarmTile(tile: FarmTileState) {
      const key = `${tile.x},${tile.y}`;
      const graphics =
        this.farmTileGraphics.get(key) ?? this.add.graphics().setDepth(3);

      this.farmTileGraphics.set(key, graphics);
      graphics.clear();

      const left = GRID_ORIGIN_X + tile.x * CELL_SIZE;
      const top = GRID_ORIGIN_Y + tile.y * CELL_SIZE;

      if (tile.soilState === "tilled") {
        graphics.fillStyle(0x9d7650, 0.86);
        graphics.fillRoundedRect(left + 4, top + 6, CELL_SIZE - 8, CELL_SIZE - 10, 5);
        graphics.lineStyle(1, 0x6f5135, 0.55);
        graphics.lineBetween(left + 8, top + 14, left + CELL_SIZE - 8, top + 12);
        graphics.lineBetween(left + 8, top + 22, left + CELL_SIZE - 8, top + 20);
      }

      if (tile.wateredUntil > Date.now() / 1000) {
        graphics.fillStyle(0x5fb7d8, 0.24);
        graphics.fillRoundedRect(left + 5, top + 7, CELL_SIZE - 10, CELL_SIZE - 12, 5);
      }

      const farm = FARM_TYPES.find((candidate) => candidate.farmTypeId === tile.farmTypeId);

      if (!farm) {
        return;
      }

      const progress = Math.min(1, tile.growthSeconds / farm.requiredGrowthSeconds);
      const centerX = left + CELL_SIZE / 2;
      const centerY = top + CELL_SIZE / 2;

      if (farm.kind === FarmKind.tree) {
        const canopy = 6 + Math.round(progress * 8);
        graphics.fillStyle(0x7a5130, 1);
        graphics.fillRoundedRect(centerX - 3, centerY + 4, 6, 12, 2);
        graphics.fillStyle(farm.color, 0.95);
        graphics.fillCircle(centerX, centerY, canopy);
        graphics.fillStyle(farm.accentColor, 1);
        graphics.fillCircle(centerX + 4, centerY - 2, 2);
        return;
      }

      const height = 7 + Math.round(progress * 11);
      graphics.lineStyle(2, farm.accentColor, 1);
      graphics.lineBetween(centerX, centerY + 10, centerX, centerY + 10 - height);
      graphics.fillStyle(farm.color, 1);
      graphics.fillCircle(centerX, centerY + 8 - height, 4 + progress * 3);
    }

    private createRemotePlayerEntity(player: VisiblePlayerState) {
      const entity = createPlayerEntity(
        this.world,
        this,
        player.state.position,
        player.appearance,
        false
      );
      this.world
        .requireComponent<RectComponent>(entity, Components.rectangle)
        .object.setAlpha(0.72);
      this.remotePlayerEntities.set(player.mint, entity);
      return entity;
    }

    private getPlayerStateKey(state: PlayerActionState) {
      return [
        state.position.x,
        state.position.y,
        state.energy.current,
        state.energy.max,
        state.activeAction.action,
        state.activeAction.kind,
        state.activeAction.startedAt,
        state.activeAction.endsAt,
      ].join(":");
    }
  };
