import Phaser from "phaser";
import {
  OBJECT_SPRITE_ASSETS,
  TERRAIN_VISUAL_ASSETS,
  objectSpriteKey,
  terrainAtlasKey,
  terrainCenterVariantsKey,
  type ObjectSpriteAssetId,
} from "../assets/visual-assets";
import { loadUiAssets } from "../assets/ui-assets";
import type { HudController } from "../client/hud";
import {
  cellKey,
  renderAutotileLayer,
  type TerrainGridLayer,
} from "./autotile";
import { createBoard } from "./board";
import { createHoverEntity, createPlayerEntity } from "./entities/index";
import { World } from "./ecs";
import {
  FARM_TYPES,
  FarmFeature,
  FarmItemId,
  FarmKind,
  getFarmItemLabel,
  type FarmTypeDefinition,
} from "./farm";
import { getWorldItemKey } from "./world-items";
import { projectFarmGrowth } from "./farm-growth";
import { GAME_SECONDS_PER_DAY, getGameTimeSeconds } from "./game-time";
import {
  CELL_SIZE,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  GRID_SIZE,
} from "./grid-constants";
import { pointerToGrid } from "./grid-math";
import { createPantheonHud } from "./pantheon-hud";
import { installGridResources, type GridInput } from "./resources";
import { beginActionTransition } from "./systems/action-transition";
import { gridSystems } from "./systems/index";
import {
  Components,
  type PlayerSpriteComponent,
  type RectComponent,
} from "./components/index";
import { ItemId } from "./terrain";
import {
  getTerrainType,
  getTileTerrainDefinition,
  TerrainFeature,
} from "./terrain";
import type {
  ContextAction,
  GameClient,
  FarmActionMode,
  FarmActionResult,
  FarmTileState,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  TileItemState,
  VisiblePlayerState,
} from "./types";

export { GAME_HEIGHT, GAME_WIDTH };

type PlantInfoPanel = {
  background: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  body: Phaser.GameObjects.Text;
  barTrack: Phaser.GameObjects.Graphics;
  barFill: Phaser.GameObjects.Graphics;
  highlight: Phaser.GameObjects.Graphics;
};

type FarmTileRender = {
  container: Phaser.GameObjects.Container;
  water: Phaser.GameObjects.Graphics;
  plant: Phaser.GameObjects.Image | null;
};

type TileItemRender = {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Graphics;
  badge: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
};

type SpriteFrameRef = {
  assetId: ObjectSpriteAssetId;
  frame: number;
};

const PLANT_INFO_WIDTH = 190;
const PLANT_INFO_HEIGHT = 112;
const PLANT_INFO_DEPTH = 20;

export const createGridScene = (client: GameClient, hud: HudController) =>
  class GridScene extends Phaser.Scene {
    private world!: World;
    private unsubscribePlayerActionState: (() => void) | null = null;
    private unsubscribePlayerAppearance: (() => void) | null = null;
    private unsubscribeVisiblePlayers: (() => void) | null = null;
    private unsubscribeInventory: (() => void) | null = null;
    private unsubscribeGoldBalance: (() => void) | null = null;
    private unsubscribeTradeOffers: (() => void) | null = null;
    private unsubscribeFarmTiles: (() => void) | null = null;
    private unsubscribeTileItems: (() => void) | null = null;
    private pantheonHud: ReturnType<typeof createPantheonHud> | null = null;
    private activePlayerEntity: number | null = null;
    private farmActionPending = false;
    private farmTileRenderElapsedMs = 0;
    private selectedFarmTileKey: string | null = null;
    private selectedTileItemKey: string | null = null;
    private plantInfoPanel: PlantInfoPanel | null = null;
    private tilledSoilContainer: Phaser.GameObjects.Container | null = null;
    private readonly farmTiles = new Map<string, FarmTileState>();
    private readonly farmTileGraphics = new Map<string, FarmTileRender>();
    private readonly tileItems = new Map<string, TileItemState>();
    private readonly tileItemGraphics = new Map<string, TileItemRender>();
    private readonly remotePlayerEntities = new Map<string, number>();
    private readonly remotePlayerStateKeys = new Map<string, string>();

    constructor() {
      super("grid-scene");
    }

    preload() {
      for (const asset of Object.values(TERRAIN_VISUAL_ASSETS)) {
        this.load.image(terrainAtlasKey(asset.id), asset.atlasUrl);
        this.load.image(
          terrainCenterVariantsKey(asset.id),
          asset.centerVariantsUrl
        );
      }

      for (const asset of Object.values(OBJECT_SPRITE_ASSETS)) {
        this.load.spritesheet(objectSpriteKey(asset.id), asset.imageUrl, {
          frameWidth: asset.frameSize,
          frameHeight: asset.frameSize,
        });
      }

      loadUiAssets(this);
    }

    create() {
      this.cameras.main.setBackgroundColor("#10191f");
      this.cameras.main.setBounds(
        0,
        0,
        GRID_SIZE * CELL_SIZE,
        GRID_SIZE * CELL_SIZE
      );
      this.cameras.main.setZoom(1);
      this.world = new World();

      installGridResources(this.world, this, client);
      createBoard(this);
      this.tilledSoilContainer = this.add
        .container(GRID_ORIGIN_X, GRID_ORIGIN_Y)
        .setDepth(-5);
      this.pantheonHud = createPantheonHud(this, hud, {
        onToolChange: (tool) => {
          this.gridInput.equippedTool = tool;
          this.refreshAvailableActions();
        },
        onContextActionChange: (action) => {
          this.gridInput.selectedContextAction = action;
        },
        onItemSelect: (itemId) => {
          this.gridInput.selectedItemId = itemId;
          this.refreshAvailableActions();
        },
        onQuantityChange: (quantity) => {
          this.gridInput.selectedQuantity = quantity;
        },
        onSleep: () => {
          void client.sleepPlayer?.();
        },
        trade: {
          createOffer: (args) =>
            client.createTradeOffer?.(args) ?? Promise.resolve(),
          acceptOffer: (offer) =>
            client.acceptTradeOffer?.(offer) ?? Promise.resolve(),
          cancelOffer: (offer) =>
            client.cancelTradeOffer?.(offer) ?? Promise.resolve(),
          finalizeOffer: (offer) =>
            client.finalizeTradeOffer?.(offer) ?? Promise.resolve(),
        },
      });
      this.world.setResource("pantheonHud", this.pantheonHud);
      createHoverEntity(this.world, this);
      const player = createPlayerEntity(this.world, this, { x: 10, y: 10 });
      this.activePlayerEntity = player;
      const playerObject = this.world.requireComponent<RectComponent>(
        player,
        Components.rectangle
      ).object;
      this.cameras.main.startFollow(playerObject, true, 0.12, 0.12);
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
        this.unsubscribeGoldBalance?.();
        this.unsubscribeGoldBalance = null;
        this.unsubscribeTradeOffers?.();
        this.unsubscribeTradeOffers = null;
        this.unsubscribeFarmTiles?.();
        this.unsubscribeFarmTiles = null;
        this.unsubscribeTileItems?.();
        this.unsubscribeTileItems = null;
      });
    }

    update(_time: number, delta: number) {
      this.world.update(delta);
      this.farmTileRenderElapsedMs += delta;

      if (this.farmTileRenderElapsedMs >= 500 && this.farmTiles.size > 0) {
        this.farmTileRenderElapsedMs = 0;
        this.redrawFarmTiles();
      }
    }

    private bindPointerInput() {
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (this.pantheonHud?.blocksPointer(pointer)) {
          this.pantheonHud.handlePointerMove(pointer);
          this.gridInput.hoverPoint = null;
          this.hidePlantInfo();
          this.refreshAvailableActions(null);
          return;
        }

        this.pantheonHud?.handlePointerMove(pointer);
        const point = pointerToGrid(pointer);
        this.gridInput.hoverPoint = point;
        this.inspectHoveredFarmTile(point);
        this.refreshAvailableActions(point);
      });

      this.input.on("pointerout", () => {
        this.gridInput.hoverPoint = null;
        this.hidePlantInfo();
        this.refreshAvailableActions(null);
      });

      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (this.pantheonHud?.handlePointerDown(pointer)) {
          return;
        }

        const point = pointerToGrid(pointer);

        if (!point) {
          return;
        }

        const action = this.resolveContextAction(point);

        if (!action) {
          this.gridInput.requestedMove = point;
          return;
        }

        this.gridInput.farmActionMode = action;
        void this.performFarmAction(action, point);
      });
    }

    private get gridInput() {
      return this.world.requireResource<GridInput>("input");
    }

    private refreshAvailableActions(
      point = this.gridInput.hoverPoint
    ) {
      this.pantheonHud?.setAvailableActions(this.getAvailableActions(point));
    }

    private resolveContextAction(point: GridPoint): ContextAction | null {
      const availableActions = this.getAvailableActions(point);
      const selectedAction = this.gridInput.selectedContextAction;

      if (selectedAction && availableActions.includes(selectedAction)) {
        return selectedAction;
      }

      return availableActions[0] ?? null;
    }

    private getAvailableActions(point: GridPoint | null): ContextAction[] {
      switch (this.gridInput.equippedTool) {
        case "hand":
          return this.getHandActions(point);
        case "hoe":
          return this.getHoeActions(point);
        case "wateringCan":
          return this.getWateringActions(point);
      }
    }

    private getHandActions(point: GridPoint | null): ContextAction[] {
      const actions: ContextAction[] = [];
      const selectedItemId = this.gridInput.selectedItemId;

      if (point && this.tileItems.has(getWorldItemKey(point))) {
        actions.push("grab");
      }

      if (selectedItemId && this.isSeedItem(selectedItemId)) {
        actions.push("plant");
      }

      if (selectedItemId) {
        actions.push("drop");
      }

      if (point && this.isHarvestable(point)) {
        actions.push("harvest");
      }

      return actions;
    }

    private getHoeActions(point: GridPoint | null): ContextAction[] {
      const actions: ContextAction[] = [];

      if (!point) {
        return actions;
      }

      if (this.isTillable(point)) {
        actions.push("till");
      }

      if (this.isChoppable(point)) {
        actions.push("chop");
      }

      return actions;
    }

    private getWateringActions(point: GridPoint | null): ContextAction[] {
      if (!point) {
        return [];
      }

      const tile = this.farmTiles.get(this.getTileKey(point));

      return tile && (tile.soilState === "tilled" || tile.farmTypeId !== 0)
        ? ["water"]
        : [];
    }

    private isSeedItem(itemId: number) {
      return FARM_TYPES.some((farm) => farm.seedItemId === itemId);
    }

    private getFarmAt(point: GridPoint) {
      const tile = this.farmTiles.get(this.getTileKey(point));
      const farm =
        tile && tile.farmTypeId
          ? FARM_TYPES.find(
              (candidate) => candidate.farmTypeId === tile.farmTypeId
            )
          : null;

      return { tile: tile ?? null, farm: farm ?? null };
    }

    private isTillable(point: GridPoint) {
      const terrain = getTerrainType(getTileTerrainDefinition(point).terrainTypeId);
      const tile = this.farmTiles.get(this.getTileKey(point));

      return (
        (terrain.featureFlags & TerrainFeature.farmable) !== 0 &&
        (!tile || (tile.soilState !== "tilled" && tile.farmTypeId === 0))
      );
    }

    private isHarvestable(point: GridPoint) {
      const { tile, farm } = this.getFarmAt(point);

      if (!tile || !farm || farm.baseYield <= 0) {
        return false;
      }

      return projectFarmGrowth(tile, farm, getGameTimeSeconds()).harvestReady;
    }

    private isChoppable(point: GridPoint) {
      const { farm } = this.getFarmAt(point);

      return Boolean(
        farm && farm.kind === FarmKind.tree && farm.chopYield > 0
      );
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
      this.unsubscribeGoldBalance =
        client.subscribeGoldBalance?.((balance) =>
          this.pantheonHud?.updateGoldBalance(balance)
        ) ?? null;
      this.unsubscribeTradeOffers =
        client.subscribeTradeOffers?.((offers) =>
          this.pantheonHud?.updateTradeOffers(offers)
        ) ?? null;
      this.unsubscribeFarmTiles =
        client.subscribeFarmTiles?.((tiles) => this.applyFarmTiles(tiles)) ??
        null;
      this.unsubscribeTileItems =
        client.subscribeTileItems?.((items) => this.applyTileItems(items)) ??
        null;
    }

    private applyPlayerActionState(player: number, state: PlayerActionState) {
      beginActionTransition(this.world, player, state);
      this.pantheonHud?.updateLocalPosition(state.position);
    }

    private applyPlayerAppearance(
      player: number,
      appearance: PlayerAppearance
    ) {
      const sprite = this.world.getComponent<PlayerSpriteComponent>(
        player,
        Components.playerSprite
      );

      sprite?.shadow.setStrokeStyle(2, appearance.stroke, 0.5);
    }

    private applyVisiblePlayers(players: VisiblePlayerState[]) {
      const visibleRemoteMints = new Set<string>();

      this.pantheonHud?.updateVisiblePlayers(players);

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
      this.pantheonHud?.updateInventory(inventory);
      this.refreshAvailableActions();
    }

    private applyFarmTiles(tiles: FarmTileState[]) {
      const visibleTiles = new Set<string>();
      this.farmTiles.clear();

      for (const tile of tiles) {
        const key = this.getTileKey(tile);
        visibleTiles.add(key);
        this.farmTiles.set(key, tile);
        this.drawFarmTile(tile);
      }

      for (const [key, render] of this.farmTileGraphics) {
        if (!visibleTiles.has(key)) {
          render.container.destroy(true);
          this.farmTileGraphics.delete(key);
        }
      }

      if (
        this.selectedFarmTileKey &&
        !this.farmTiles.has(this.selectedFarmTileKey)
      ) {
        this.hidePlantInfo();
      }

      this.redrawTilledSoilLayer();
      this.inspectHoveredFarmTile(this.gridInput.hoverPoint);
      this.refreshAvailableActions();
    }

    private applyTileItems(items: TileItemState[]) {
      const visibleItems = new Set<string>();
      this.tileItems.clear();

      for (const item of items) {
        const key = getWorldItemKey(item);
        visibleItems.add(key);
        this.tileItems.set(key, item);
        this.drawTileItem(item);
      }

      for (const [key, render] of this.tileItemGraphics) {
        if (!visibleItems.has(key)) {
          render.container.destroy(true);
          this.tileItemGraphics.delete(key);
        }
      }

      if (
        this.selectedTileItemKey &&
        !this.tileItems.has(this.selectedTileItemKey)
      ) {
        this.hidePlantInfo();
      }

      this.inspectHoveredFarmTile(this.gridInput.hoverPoint);
      this.refreshAvailableActions();
    }

    private redrawFarmTiles() {
      const nowGameSeconds = getGameTimeSeconds();

      for (const tile of this.farmTiles.values()) {
        this.drawFarmTile(tile, nowGameSeconds);
      }

      this.refreshPlantInfo(nowGameSeconds);
    }

    private async performFarmAction(
      mode: FarmActionMode,
      point: { x: number; y: number }
    ) {
      if (this.farmActionPending || !client.performFarmAction) {
        return;
      }

      this.farmActionPending = true;
      try {
        const result = await client.performFarmAction(
          mode,
          point,
          this.gridInput.selectedItemId,
          this.gridInput.selectedQuantity
        );

        if (!result) {
          return;
        }

        if (this.activePlayerEntity !== null) {
          beginActionTransition(
            this.world,
            this.activePlayerEntity,
            result.player
          );
          this.setPlayerActionPose(this.activePlayerEntity, mode, point, result);
        }

        if (result.tile) {
          this.farmTiles.set(this.getTileKey(result.tile), result.tile);
          this.drawFarmTile(result.tile);
          this.redrawTilledSoilLayer();
          this.refreshPlantInfo();
        }

        if (result.item) {
          this.tileItems.set(getWorldItemKey(result.item), result.item);
          this.drawTileItem(result.item);
        } else if (mode === "grab") {
          const key = getWorldItemKey(point);
          this.tileItemGraphics.get(key)?.container.destroy(true);
          this.tileItemGraphics.delete(key);
          this.tileItems.delete(key);
          if (this.selectedTileItemKey === key) {
            this.hidePlantInfo();
          }
        }
      } finally {
        this.farmActionPending = false;
        this.refreshAvailableActions();
      }
    }

    private setPlayerActionPose(
      player: number,
      mode: FarmActionMode,
      point: GridPoint,
      result: FarmActionResult
    ) {
      if (mode === "move") {
        return;
      }

      const sprite = this.world.getComponent<PlayerSpriteComponent>(
        player,
        Components.playerSprite
      );

      if (!sprite) {
        return;
      }

      const now = Date.now() / 1000;
      const endsAt =
        result.player.activeAction.endsAt > now
          ? result.player.activeAction.endsAt
          : now + 0.45;

      sprite.actionPose = {
        target: { ...point },
        mode,
        endsAt,
      };
    }

    private drawTileItem(item: TileItemState) {
      const key = getWorldItemKey(item);

      if (item.itemId === 0 || item.quantity === 0) {
        this.tileItemGraphics.get(key)?.container.destroy(true);
        this.tileItemGraphics.delete(key);
        this.tileItems.delete(key);
        return;
      }

      const left = GRID_ORIGIN_X + item.x * CELL_SIZE;
      const top = GRID_ORIGIN_Y + item.y * CELL_SIZE;
      const centerX = left + CELL_SIZE / 2;
      const centerY = top + CELL_SIZE / 2;
      const frame = getItemSpriteFrame(item.itemId);
      let render = this.tileItemGraphics.get(key);

      if (!render) {
        const container = this.add
          .container(0, 0)
          .setDepth(70 + (top + CELL_SIZE) * 0.01);
        const shadow = this.add.graphics();
        const sprite = this.add.image(
          centerX,
          centerY,
          objectSpriteKey(frame.assetId),
          frame.frame
        );
        const badge = this.add.graphics();

        container.add([shadow, sprite, badge]);
        render = { container, shadow, badge, sprite };
        this.tileItemGraphics.set(key, render);
      }

      render.container.setDepth(70 + (top + CELL_SIZE) * 0.01);
      render.shadow.clear();
      render.shadow.fillStyle(0x1a2a23, 0.2);
      render.shadow.fillEllipse(centerX, centerY + 28, 58, 18);
      render.sprite
        .setTexture(objectSpriteKey(frame.assetId), frame.frame)
        .setPosition(centerX, centerY + 8)
        .setOrigin(0.5, 0.62)
        .setDisplaySize(70, 70);

      if (item.quantity > 1) {
        render.badge.clear();
        render.badge.fillStyle(0x17211e, 0.82);
        render.badge.fillRoundedRect(centerX + 18, centerY + 12, 28, 22, 8);
        render.badge.lineStyle(1, 0xffffff, 0.7);
        render.badge.strokeRoundedRect(centerX + 18, centerY + 12, 28, 22, 8);
      } else {
        render.badge.clear();
      }
    }

    private drawFarmTile(
      tile: FarmTileState,
      nowGameSeconds = getGameTimeSeconds()
    ) {
      const key = this.getTileKey(tile);
      const left = GRID_ORIGIN_X + tile.x * CELL_SIZE;
      const top = GRID_ORIGIN_Y + tile.y * CELL_SIZE;
      let render = this.farmTileGraphics.get(key);

      if (!render) {
        const container = this.add
          .container(0, 0)
          .setDepth(70 + (top + CELL_SIZE) * 0.01);
        const water = this.add.graphics();

        container.add([water]);
        render = { container, water, plant: null };
        this.farmTileGraphics.set(key, render);
      }

      render.container.setDepth(70 + (top + CELL_SIZE) * 0.01);
      render.water.clear();

      if (tile.wateredUntil > nowGameSeconds) {
        render.water.fillStyle(0x72d6ff, 0.22);
        render.water.fillRoundedRect(
          left + 16,
          top + 18,
          CELL_SIZE - 32,
          CELL_SIZE - 28,
          18
        );
      }

      const farm = FARM_TYPES.find(
        (candidate) => candidate.farmTypeId === tile.farmTypeId
      );

      if (!farm) {
        render.plant?.destroy();
        render.plant = null;
        return;
      }

      const growth = projectFarmGrowth(tile, farm, nowGameSeconds);
      const centerX = left + CELL_SIZE / 2;
      const centerY = top + CELL_SIZE / 2;
      const spriteFrame = getFarmSpriteFrame(farm, growth, tile);
      const textureKey = objectSpriteKey(farm.spriteAssetId);

      if (!render.plant) {
        render.plant = this.add.image(
          centerX,
          centerY,
          textureKey,
          spriteFrame
        );
        render.container.add(render.plant);
      }

      const displaySize =
        farm.kind === FarmKind.tree
          ? 82 + Math.min(1, growth.progress) * 134
          : 54 + Math.min(1, growth.progress) * 36;

      render.plant
        .setTexture(textureKey, spriteFrame)
        .setPosition(
          centerX,
          farm.kind === FarmKind.tree ? top + CELL_SIZE : centerY + 5
        )
        .setOrigin(0.5, farm.kind === FarmKind.tree ? 0.86 : 0.68)
        .setDisplaySize(displaySize, displaySize);
    }

    private redrawTilledSoilLayer() {
      if (!this.tilledSoilContainer) {
        return;
      }

      const layer: TerrainGridLayer = {
        assetId: "uniswap-dirt",
        cells: new Set<string>(),
      };

      for (const tile of this.farmTiles.values()) {
        if (tile.soilState === "tilled") {
          layer.cells.add(cellKey(tile.x, tile.y));
        }
      }

      renderAutotileLayer(
        this,
        this.tilledSoilContainer,
        layer,
        terrainAtlasKey("uniswap-dirt"),
        terrainCenterVariantsKey("uniswap-dirt"),
        CELL_SIZE,
        GRID_SIZE,
        GRID_SIZE
      );
    }

    private showPlantInfo(tile: FarmTileState) {
      this.selectedFarmTileKey = this.getTileKey(tile);
      this.selectedTileItemKey = null;
      this.refreshPlantInfo();
    }

    private showTileItemInfo(item: TileItemState) {
      this.selectedFarmTileKey = null;
      this.selectedTileItemKey = getWorldItemKey(item);

      const panel = this.ensurePlantInfoPanel();
      const label = getFarmItemLabel(item.itemId);

      this.positionInfoPanel(item, panel, 0xf0c15b);
      panel.barTrack.clear();
      panel.barFill.clear();
      panel.title.setText(`${label} (${item.x}, ${item.y})`);
      panel.body.setText(`Quantity ${item.quantity}`);
    }

    private inspectHoveredFarmTile(point: { x: number; y: number } | null) {
      if (!point) {
        this.hidePlantInfo();
        return;
      }

      const item = this.tileItems.get(getWorldItemKey(point));

      if (item) {
        this.showTileItemInfo(item);
        return;
      }

      const tile = this.farmTiles.get(this.getTileKey(point));

      if (tile?.farmTypeId) {
        this.showPlantInfo(tile);
        return;
      }

      this.hidePlantInfo();
    }

    private refreshPlantInfo(nowGameSeconds = getGameTimeSeconds()) {
      if (!this.selectedFarmTileKey) {
        return;
      }

      const tile = this.farmTiles.get(this.selectedFarmTileKey);
      const farm = tile
        ? FARM_TYPES.find(
            (candidate) => candidate.farmTypeId === tile.farmTypeId
          )
        : null;

      if (!tile || !farm) {
        this.hidePlantInfo();
        return;
      }

      const growth = projectFarmGrowth(tile, farm, nowGameSeconds);
      const panel = this.ensurePlantInfoPanel();
      const stageCount = farm.stageThresholdSeconds.length;
      const stageLabel = `Stage ${growth.stageIndex + 1}/${stageCount}`;
      const status = growth.harvestReady
        ? "Ready"
        : tile.wateredUntil > nowGameSeconds
        ? "Growing"
        : farm.flags & FarmFeature.needsWater
        ? "Needs water"
        : "Growing";
      const remainingSeconds = Math.max(
        0,
        farm.requiredGrowthSeconds - growth.growthSeconds
      );
      const plantedAt = this.formatGameTimestamp(tile.plantedAt);

      this.positionPlantInfoPanel(tile, panel);
      panel.title.setText(`${farm.label} (${tile.x}, ${tile.y})`);
      panel.body.setText(
        [
          `${stageLabel} · ${Math.round(growth.progress * 100)}% · ${status}`,
          growth.harvestReady
            ? "Harvest is available"
            : `Growth ${this.formatGameDuration(
                growth.growthSeconds
              )} / ${this.formatGameDuration(farm.requiredGrowthSeconds)}`,
          growth.harvestReady
            ? "Fully grown"
            : `Remaining ${this.formatGameDuration(remainingSeconds)}`,
          `Planted ${plantedAt}`,
        ].join("\n")
      );
      this.drawPlantInfoBar(panel, growth.progress);
    }

    private ensurePlantInfoPanel() {
      if (this.plantInfoPanel) {
        return this.plantInfoPanel;
      }

      const highlight = this.add.graphics().setDepth(PLANT_INFO_DEPTH - 1);
      const background = this.add.graphics().setDepth(PLANT_INFO_DEPTH);
      const barTrack = this.add.graphics().setDepth(PLANT_INFO_DEPTH + 1);
      const barFill = this.add.graphics().setDepth(PLANT_INFO_DEPTH + 2);
      const title = this.add
        .text(0, 0, "", {
          color: "#17211e",
          fixedWidth: PLANT_INFO_WIDTH - 22,
          fontFamily: "Inter, sans-serif",
          fontSize: "13px",
          fontStyle: "700",
          wordWrap: { width: PLANT_INFO_WIDTH - 22 },
        })
        .setDepth(PLANT_INFO_DEPTH + 3);
      const body = this.add
        .text(0, 0, "", {
          color: "#344a42",
          fixedWidth: PLANT_INFO_WIDTH - 22,
          fontFamily: "Inter, sans-serif",
          fontSize: "10px",
          lineSpacing: 3,
          wordWrap: { width: PLANT_INFO_WIDTH - 22 },
        })
        .setDepth(PLANT_INFO_DEPTH + 3);

      this.plantInfoPanel = {
        background,
        title,
        body,
        barTrack,
        barFill,
        highlight,
      };
      return this.plantInfoPanel;
    }

    private positionPlantInfoPanel(tile: FarmTileState, panel: PlantInfoPanel) {
      this.positionInfoPanel(tile, panel, 0xffe0a3);
    }

    private positionInfoPanel(
      point: { x: number; y: number },
      panel: PlantInfoPanel,
      highlightColor: number
    ) {
      const tileLeft = GRID_ORIGIN_X + point.x * CELL_SIZE;
      const tileTop = GRID_ORIGIN_Y + point.y * CELL_SIZE;
      const x =
        point.x >= GRID_SIZE - 3
          ? tileLeft - PLANT_INFO_WIDTH - 16
          : tileLeft + CELL_SIZE + 16;
      const y = Math.max(18, tileTop - 12);

      panel.highlight.clear();
      panel.highlight.lineStyle(2, highlightColor, 1);
      panel.highlight.strokeRoundedRect(
        tileLeft + 3,
        tileTop + 3,
        CELL_SIZE - 6,
        CELL_SIZE - 6,
        18
      );

      panel.background.clear();
      panel.background.fillStyle(0xf7f1e5, 0.98);
      panel.background.fillRoundedRect(
        x,
        y,
        PLANT_INFO_WIDTH,
        PLANT_INFO_HEIGHT,
        8
      );
      panel.background.lineStyle(1, 0xa26924, 0.9);
      panel.background.strokeRoundedRect(
        x,
        y,
        PLANT_INFO_WIDTH,
        PLANT_INFO_HEIGHT,
        8
      );
      panel.title.setPosition(x + 11, y + 10);
      panel.body.setPosition(x + 11, y + 34);
    }

    private drawPlantInfoBar(panel: PlantInfoPanel, progress: number) {
      const x = panel.body.x;
      const y = panel.body.y + 60;
      const width = PLANT_INFO_WIDTH - 22;

      panel.barTrack.clear();
      panel.barTrack.fillStyle(0xd3c9b3, 1);
      panel.barTrack.fillRoundedRect(x, y, width, 8, 4);
      panel.barFill.clear();
      panel.barFill.fillStyle(0x8fbe67, 1);
      panel.barFill.fillRoundedRect(
        x,
        y,
        Math.max(4, width * Math.min(1, Math.max(0, progress))),
        8,
        4
      );
    }

    private hidePlantInfo() {
      this.selectedFarmTileKey = null;
      this.selectedTileItemKey = null;

      if (!this.plantInfoPanel) {
        return;
      }

      this.plantInfoPanel.background.clear();
      this.plantInfoPanel.barTrack.clear();
      this.plantInfoPanel.barFill.clear();
      this.plantInfoPanel.highlight.clear();
      this.plantInfoPanel.title.setText("");
      this.plantInfoPanel.body.setText("");
    }

    private formatGameTimestamp(gameSeconds: number) {
      if (gameSeconds <= 0) {
        return "unknown";
      }

      const day = Math.floor(gameSeconds / GAME_SECONDS_PER_DAY) + 1;
      const secondsInDay = gameSeconds % GAME_SECONDS_PER_DAY;
      const hour = Math.floor(secondsInDay / (60 * 60));
      const minute = Math.floor((secondsInDay % (60 * 60)) / 60);

      return `Day ${day} ${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
    }

    private formatGameDuration(seconds: number) {
      const clampedSeconds = Math.max(0, Math.floor(seconds));
      const days = Math.floor(clampedSeconds / GAME_SECONDS_PER_DAY);
      const hours = Math.floor(
        (clampedSeconds % GAME_SECONDS_PER_DAY) / (60 * 60)
      );
      const minutes = Math.floor((clampedSeconds % (60 * 60)) / 60);

      if (days > 0) {
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
      }

      if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }

      return `${minutes}m`;
    }

    private getTileKey(point: { x: number; y: number }) {
      return `${point.x},${point.y}`;
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
        .object.setAlpha(0.72)
        .setInteractive({ useHandCursor: true })
        .on(
          "pointerdown",
          (
            _pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData
          ) => {
            event.stopPropagation();
            this.pantheonHud?.selectSeller(player.mint);
          }
        );
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

type FarmGrowthProjection = ReturnType<typeof projectFarmGrowth>;

const getFarmSpriteFrame = (
  farm: FarmTypeDefinition,
  growth: FarmGrowthProjection,
  tile: FarmTileState
) => {
  const columns = OBJECT_SPRITE_ASSETS[farm.spriteAssetId].columns;
  const stageColumn = Math.min(columns - 1, Math.max(0, growth.stageIndex));
  const variantColumn = Math.abs(tile.x * 17 + tile.y * 31) % columns;
  const wasHarvested =
    tile.lastHarvestedAt > 0 && tile.lastHarvestedAt >= tile.plantedAt;

  if (growth.harvestReady) {
    return 2 * columns + variantColumn;
  }

  if (wasHarvested && farm.regrowSeconds > 0) {
    return 3 * columns;
  }

  if (growth.stageIndex <= 0) {
    return Math.min(columns - 1, Math.max(1, stageColumn + 1));
  }

  return columns + stageColumn;
};

const getItemSpriteFrame = (itemId: number): SpriteFrameRef => {
  const farm = FARM_TYPES.find(
    (candidate) =>
      candidate.seedItemId === itemId ||
      candidate.harvestItemId === itemId ||
      candidate.chopItemId === itemId
  );

  if (farm) {
    const columns = OBJECT_SPRITE_ASSETS[farm.spriteAssetId].columns;
    if (farm.seedItemId === itemId) {
      return { assetId: farm.spriteAssetId, frame: 0 };
    }

    if (farm.harvestItemId === itemId) {
      return { assetId: farm.spriteAssetId, frame: 3 * columns + 1 };
    }

    return { assetId: farm.spriteAssetId, frame: 3 * columns + 2 };
  }

  switch (itemId) {
    case ItemId.berry:
      return { assetId: "routeberry", frame: 13 };
    case ItemId.grassFiber:
      return { assetId: "city-clover", frame: 13 };
    case ItemId.stone:
      return { assetId: "stonepine", frame: 14 };
    case ItemId.reed:
      return { assetId: "routeberry", frame: 12 };
    case FarmItemId.wood:
    case FarmItemId.oakLog:
      return { assetId: "stonepine", frame: 14 };
    default:
      return { assetId: "city-clover", frame: 0 };
  }
};
