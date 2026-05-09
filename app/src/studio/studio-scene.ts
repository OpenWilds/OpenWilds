import Phaser from "phaser";
import {
  BUILT_IN_TERRAIN_VISUAL_ASSET_IDS,
  TERRAIN_VISUAL_ASSETS,
  terrainAtlasKey,
  terrainCenterVariantsKey,
  type TerrainVisualAsset,
  type TerrainVisualAssetId,
} from "../assets/visual-assets";
import {
  cellKey,
  renderAutotileLayer,
  type TerrainGridLayer,
} from "../game/autotile";

export const STUDIO_WIDTH = 1280;
export const STUDIO_HEIGHT = 820;

const MIN_WORLD_SIZE = 5;
const MAX_WORLD_SIZE = 200;
const DEFAULT_WORLD_SIZE = 40;
const TILE_SIZE = 32;
const GRID_DEPTH = 500;
const BASE_TERRAIN: TerrainVisualAssetId = "uniswap-plain";
const STUDIO_LAYER_COUNT = 5;
const PAINTABLE_TERRAINS: TerrainVisualAssetId[] = [
  "uniswap-grass",
  "uniswap-forest-floor",
  "uniswap-stone",
  "uniswap-water",
  "uniswap-dirt",
];

export const STUDIO_LAYER_OPTIONS = Array.from(
  { length: STUDIO_LAYER_COUNT },
  (_, index) => index + 1
);

export const STUDIO_TERRAIN_OPTIONS = PAINTABLE_TERRAINS;

type PaintMode = "paint" | "erase";

type StudioMapLayerExport = {
  layer: number;
  terrainId: TerrainVisualAssetId;
  cells: Array<[number, number]>;
};

export type StudioMapExport = {
  version: 1;
  width: number;
  height: number;
  tileSize: number;
  baseTerrain: TerrainVisualAssetId;
  terrainAssets?: TerrainVisualAsset[];
  layers: StudioMapLayerExport[];
};

type StudioSceneOptions = {
  terrainAssets?: TerrainVisualAsset[];
  onStateChange?: (state: StudioSceneState) => void;
  onReady?: () => void;
};

type StudioLayer = TerrainGridLayer & {
  assetId: TerrainVisualAssetId;
  slot: number;
  container: Phaser.GameObjects.Container;
  dirty: boolean;
};

export type StudioSceneState = {
  width: number;
  height: number;
  selectedLayer: number;
  selectedTerrain: TerrainVisualAssetId;
  brushSize: number;
  paintMode: PaintMode;
  showGrid: boolean;
  activeLayerCellCount: number;
  message: string;
};

export class StudioScene extends Phaser.Scene {
  private readonly options: StudioSceneOptions;
  private widthTiles = DEFAULT_WORLD_SIZE;
  private heightTiles = DEFAULT_WORLD_SIZE;
  private selectedLayer = 1;
  private selectedTerrain: TerrainVisualAssetId = "uniswap-grass";
  private brushSize = 1;
  private paintMode: PaintMode = "paint";
  private showGrid = true;
  private isPainting = false;
  private isPanning = false;
  private panStart: Phaser.Math.Vector2 | null = null;
  private cameraStart: Phaser.Math.Vector2 | null = null;
  private lastPaintKey = "";
  private worldLayer!: Phaser.GameObjects.Container;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private terrainAssets: TerrainVisualAsset[];
  private paintableTerrains: TerrainVisualAssetId[];
  private readonly layers = new Map<
    number,
    Map<TerrainVisualAssetId, StudioLayer>
  >();

  constructor(options: StudioSceneOptions) {
    super("studio-scene");
    this.options = options;
    this.terrainAssets = mergeTerrainAssets(options.terrainAssets ?? []);
    this.paintableTerrains = this.terrainAssets
      .map((asset) => asset.id)
      .filter((assetId) => assetId !== BASE_TERRAIN);
  }

  preload() {
    for (const asset of this.terrainAssets) {
      this.load.image(terrainAtlasKey(asset.id), asset.atlasUrl);
      this.load.image(
        terrainCenterVariantsKey(asset.id),
        asset.centerVariantsUrl
      );
    }
  }

  create() {
    this.input.mouse?.disableContextMenu();
    this.cameras.main.setBackgroundColor("#17211e");
    this.worldLayer = this.add.container(0, 0).setDepth(0);
    this.gridGraphics = this.add.graphics().setDepth(GRID_DEPTH);

    this.createLayers();
    this.renderAllLayers();
    this.drawGrid();
    this.registerInput();
    this.updateCameraBounds();
    this.updateStatus();
    this.options.onReady?.();
  }

  update() {
    for (const terrainLayers of this.layers.values()) {
      for (const layer of terrainLayers.values()) {
        if (layer.dirty) {
          this.renderLayer(layer);
        }
      }
    }
  }

  importMap(map: StudioMapExport) {
    validateStudioMap(map);
    this.widthTiles = map.width;
    this.heightTiles = map.height;

    for (const asset of map.terrainAssets ?? []) {
      this.addTerrainAsset(asset, false);
    }

    for (const terrainLayers of this.layers.values()) {
      for (const layer of terrainLayers.values()) {
        layer.cells.clear();
        layer.dirty = true;
      }
    }

    this.fillBaseLayer();
    for (const exportedLayer of map.layers) {
      if (exportedLayer.terrainId === BASE_TERRAIN) {
        continue;
      }

      const layer = this.getLayer(
        exportedLayer.layer ?? 1,
        exportedLayer.terrainId
      );
      if (!layer) {
        continue;
      }

      for (const [x, y] of exportedLayer.cells) {
        layer.cells.add(cellKey(x, y));
      }
      layer.dirty = true;
    }

    this.updateCameraBounds();
    this.drawGrid();
    this.updateStatus("Imported map JSON");
  }

  setSelectedTerrain(terrainId: TerrainVisualAssetId) {
    if (!this.paintableTerrains.includes(terrainId)) {
      return;
    }

    this.selectedTerrain = terrainId;
    this.updateStatus();
  }

  setSelectedLayer(layer: number) {
    if (!isValidLayer(layer)) {
      return;
    }

    this.selectedLayer = layer;
    this.updateStatus();
  }

  setBrushSize(size: number) {
    if (![1, 3, 5].includes(size)) {
      return;
    }

    this.brushSize = size;
    this.updateStatus();
  }

  setPaintMode(mode: PaintMode) {
    this.paintMode = mode;
    this.updateStatus();
  }

  setGridVisible(visible: boolean) {
    this.showGrid = visible;
    this.drawGrid();
    this.updateStatus();
  }

  fillActiveLayer() {
    this.fillSelectedLayer();
  }

  clearActiveLayer() {
    this.clearSelectedLayer();
  }

  resizeMap(width: number, height: number) {
    if (!isValidWorldSize(width) || !isValidWorldSize(height)) {
      this.updateStatus("Invalid size. Use numbers from 5 to 200.");
      return false;
    }

    this.resizeWorld(width, height);
    return true;
  }

  getExport(): StudioMapExport {
    return this.exportMap();
  }

  addTerrainAsset(asset: TerrainVisualAsset, selectAfterLoad = true) {
    const normalizedAsset: TerrainVisualAsset = {
      ...asset,
      id: asset.id.trim(),
      label: asset.label?.trim() || terrainLabel(asset.id),
      generated: asset.generated ?? true,
    };
    const existingIndex = this.terrainAssets.findIndex(
      (terrainAsset) => terrainAsset.id === normalizedAsset.id
    );

    if (existingIndex >= 0) {
      this.terrainAssets[existingIndex] = normalizedAsset;
    } else {
      this.terrainAssets.push(normalizedAsset);
    }

    this.paintableTerrains = this.terrainAssets
      .map((terrainAsset) => terrainAsset.id)
      .filter((assetId) => assetId !== BASE_TERRAIN);
    this.addLayerForTerrain(normalizedAsset.id);
    this.loadGeneratedTerrainTextures(normalizedAsset, () => {
      if (selectAfterLoad) {
        this.setSelectedTerrain(normalizedAsset.id);
      }
      this.updateStatus(`Added ${terrainLabel(normalizedAsset.id)}`);
    });
  }

  getState(): StudioSceneState {
    const activeLayer = this.getLayer(this.selectedLayer, this.selectedTerrain);

    return {
      width: this.widthTiles,
      height: this.heightTiles,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: activeLayer?.cells.size ?? 0,
      message: "Drag to paint. Right/middle drag pans. Wheel zooms.",
    };
  }

  private createLayers() {
    this.layers.clear();
    this.worldLayer.removeAll(true);

    const baseContainer = this.add.container(0, 0).setDepth(0);
    this.worldLayer.add(baseContainer);
    this.layers.set(
      0,
      new Map([
        [
          BASE_TERRAIN,
          {
            assetId: BASE_TERRAIN,
            slot: 0,
            cells: new Set<string>(),
            container: baseContainer,
            dirty: true,
          },
        ],
      ])
    );

    for (let slot = 1; slot <= STUDIO_LAYER_COUNT; slot += 1) {
      const terrainLayers = new Map<TerrainVisualAssetId, StudioLayer>();

      this.paintableTerrains.forEach((assetId, terrainIndex) => {
        const container = this.add
          .container(0, 0)
          .setDepth(slot * 10 + terrainIndex);

        this.worldLayer.add(container);
        terrainLayers.set(assetId, {
          assetId,
          slot,
          cells: new Set<string>(),
          container,
          dirty: true,
        });
      });

      this.layers.set(slot, terrainLayers);
    }

    this.fillBaseLayer();
  }

  private fillBaseLayer() {
    const baseLayer = this.getLayer(0, BASE_TERRAIN);
    if (!baseLayer) {
      return;
    }

    baseLayer.cells.clear();
    for (let y = 0; y < this.heightTiles; y += 1) {
      for (let x = 0; x < this.widthTiles; x += 1) {
        baseLayer.cells.add(cellKey(x, y));
      }
    }
    baseLayer.dirty = true;
  }

  private renderAllLayers() {
    for (const terrainLayers of this.layers.values()) {
      for (const layer of terrainLayers.values()) {
        this.renderLayer(layer);
      }
    }
  }

  private getLayer(slot: number, terrainId: TerrainVisualAssetId) {
    return this.layers.get(slot)?.get(terrainId) ?? null;
  }

  private addLayerForTerrain(assetId: TerrainVisualAssetId) {
    for (let slot = 1; slot <= STUDIO_LAYER_COUNT; slot += 1) {
      const terrainLayers = this.layers.get(slot);

      if (!terrainLayers || terrainLayers.has(assetId)) {
        continue;
      }

      const container = this.add
        .container(0, 0)
        .setDepth(slot * 10 + terrainLayers.size);

      this.worldLayer.add(container);
      terrainLayers.set(assetId, {
        assetId,
        slot,
        cells: new Set<string>(),
        container,
        dirty: false,
      });
    }
  }

  private renderLayer(layer: StudioLayer) {
    if (
      !this.textures.exists(terrainAtlasKey(layer.assetId)) ||
      !this.textures.exists(terrainCenterVariantsKey(layer.assetId))
    ) {
      return;
    }

    renderAutotileLayer(
      this,
      layer.container,
      layer,
      terrainAtlasKey(layer.assetId),
      terrainCenterVariantsKey(layer.assetId),
      TILE_SIZE,
      this.widthTiles,
      this.heightTiles
    );
    layer.dirty = false;
  }

  private registerInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown() || pointer.rightButtonDown()) {
        this.startPan(pointer);
        return;
      }

      this.isPainting = true;
      this.lastPaintKey = "";
      this.paintAtPointer(pointer);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning) {
        this.panCamera(pointer);
        return;
      }

      if (this.isPainting) {
        this.paintAtPointer(pointer);
      }
    });

    this.input.on("pointerup", () => {
      this.isPainting = false;
      this.isPanning = false;
      this.lastPaintKey = "";
    });

    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        deltaY: number
      ) => {
        const nextZoom = Phaser.Math.Clamp(
          this.cameras.main.zoom * (deltaY > 0 ? 0.9 : 1.1),
          0.25,
          3
        );

        this.zoomAtPointer(pointer, nextZoom);
      }
    );
  }

  private zoomAtPointer(pointer: Phaser.Input.Pointer, nextZoom: number) {
    const camera = this.cameras.main;
    const worldPointBeforeZoom = camera.getWorldPoint(pointer.x, pointer.y);

    camera.setZoom(nextZoom);
    camera.preRender();

    const worldPointAfterZoom = camera.getWorldPoint(pointer.x, pointer.y);
    camera.scrollX += worldPointBeforeZoom.x - worldPointAfterZoom.x;
    camera.scrollY += worldPointBeforeZoom.y - worldPointAfterZoom.y;
  }

  private paintAtPointer(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    if (!this.isInBounds(tileX, tileY)) {
      return;
    }

    const stampKey = `${tileX},${tileY},${this.brushSize},${this.paintMode},${this.selectedTerrain}`;
    if (stampKey === this.lastPaintKey) {
      return;
    }
    this.lastPaintKey = stampKey;

    const radius = Math.floor(this.brushSize / 2);
    const changedLayers = new Set<StudioLayer>();

    for (let y = tileY - radius; y <= tileY + radius; y += 1) {
      for (let x = tileX - radius; x <= tileX + radius; x += 1) {
        if (!this.isInBounds(x, y)) {
          continue;
        }

        for (const layer of this.applyPaintAt(x, y)) {
          changedLayers.add(layer);
        }
      }
    }

    for (const layer of changedLayers) {
      layer.dirty = true;
    }
    this.updateStatus();
  }

  private applyPaintAt(x: number, y: number) {
    const changedLayers: StudioLayer[] = [];
    const key = cellKey(x, y);
    const terrainLayers = this.layers.get(this.selectedLayer);

    if (!terrainLayers) {
      return changedLayers;
    }

    const selectedLayer = terrainLayers.get(this.selectedTerrain);
    if (!selectedLayer) {
      return changedLayers;
    }

    if (this.paintMode === "erase") {
      for (const layer of terrainLayers.values()) {
        if (layer.cells.delete(key)) {
          changedLayers.push(layer);
        }
      }
      return changedLayers;
    }

    for (const layer of terrainLayers.values()) {
      if (layer !== selectedLayer && layer.cells.delete(key)) {
        changedLayers.push(layer);
      }
    }

    if (!selectedLayer.cells.has(key)) {
      selectedLayer.cells.add(key);
      changedLayers.push(selectedLayer);
    }

    return changedLayers;
  }

  private startPan(pointer: Phaser.Input.Pointer) {
    this.isPanning = true;
    this.panStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
    this.cameraStart = new Phaser.Math.Vector2(
      this.cameras.main.scrollX,
      this.cameras.main.scrollY
    );
  }

  private panCamera(pointer: Phaser.Input.Pointer) {
    if (!this.panStart || !this.cameraStart) {
      return;
    }

    const camera = this.cameras.main;
    camera.scrollX =
      this.cameraStart.x - (pointer.x - this.panStart.x) / camera.zoom;
    camera.scrollY =
      this.cameraStart.y - (pointer.y - this.panStart.y) / camera.zoom;
  }

  private fillSelectedLayer() {
    const terrainLayers = this.layers.get(this.selectedLayer);
    if (!terrainLayers) {
      return;
    }

    const layer = terrainLayers.get(this.selectedTerrain);
    if (!layer) {
      return;
    }

    for (const otherLayer of terrainLayers.values()) {
      if (otherLayer !== layer) {
        otherLayer.cells.clear();
        otherLayer.dirty = true;
      }
    }

    layer.cells.clear();
    for (let y = 0; y < this.heightTiles; y += 1) {
      for (let x = 0; x < this.widthTiles; x += 1) {
        layer.cells.add(cellKey(x, y));
      }
    }
    layer.dirty = true;
    this.updateStatus(
      `Filled layer ${this.selectedLayer} with ${terrainLabel(
        this.selectedTerrain
      )}`
    );
  }

  private clearSelectedLayer() {
    const terrainLayers = this.layers.get(this.selectedLayer);
    if (!terrainLayers) {
      return;
    }

    for (const layer of terrainLayers.values()) {
      layer.cells.clear();
      layer.dirty = true;
    }
    this.updateStatus(`Cleared layer ${this.selectedLayer}`);
  }

  private resizeWorld(width: number, height: number) {
    this.widthTiles = width;
    this.heightTiles = height;

    for (const terrainLayers of this.layers.values()) {
      for (const layer of terrainLayers.values()) {
        for (const key of [...layer.cells]) {
          const [x, y] = key.split(",").map(Number);
          if (!this.isInBounds(x, y)) {
            layer.cells.delete(key);
          }
        }
        layer.dirty = true;
      }
    }

    this.fillBaseLayer();
    this.updateCameraBounds();
    this.drawGrid();
    this.updateStatus(`Resized to ${width}x${height}`);
  }

  private drawGrid() {
    this.gridGraphics.clear();
    if (!this.showGrid) {
      return;
    }

    this.gridGraphics.lineStyle(1, 0xffffff, 0.12);
    const worldWidth = this.widthTiles * TILE_SIZE;
    const worldHeight = this.heightTiles * TILE_SIZE;

    for (let x = 0; x <= this.widthTiles; x += 1) {
      const pixelX = x * TILE_SIZE;
      this.gridGraphics.lineBetween(pixelX, 0, pixelX, worldHeight);
    }

    for (let y = 0; y <= this.heightTiles; y += 1) {
      const pixelY = y * TILE_SIZE;
      this.gridGraphics.lineBetween(0, pixelY, worldWidth, pixelY);
    }
  }

  private updateCameraBounds() {
    const worldWidth = this.widthTiles * TILE_SIZE;
    const worldHeight = this.heightTiles * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.centerOn(worldWidth / 2, worldHeight / 2);
    this.cameras.main.setZoom(
      Math.min(1.2, STUDIO_WIDTH / worldWidth, STUDIO_HEIGHT / worldHeight)
    );
  }

  private updateStatus(message?: string) {
    const activeLayer = this.getLayer(this.selectedLayer, this.selectedTerrain);
    const cellCount = activeLayer?.cells.size ?? 0;
    this.options.onStateChange?.({
      width: this.widthTiles,
      height: this.heightTiles,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: cellCount,
      message: message ?? "Drag to paint. Right/middle drag pans. Wheel zooms.",
    });
  }

  private exportMap(): StudioMapExport {
    return {
      version: 1,
      width: this.widthTiles,
      height: this.heightTiles,
      tileSize: TILE_SIZE,
      baseTerrain: BASE_TERRAIN,
      terrainAssets: this.terrainAssets.filter((asset) => asset.generated),
      layers: STUDIO_LAYER_OPTIONS.flatMap((slot) => {
        const terrainLayers = this.layers.get(slot);
        if (!terrainLayers) {
          return [];
        }

        return this.paintableTerrains.map((terrainId) => {
          const layer = terrainLayers.get(terrainId);
          const cells = [...(layer?.cells ?? [])]
            .map((key) => key.split(",").map(Number) as [number, number])
            .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);

          return { layer: slot, terrainId, cells };
        }).filter((layer) => layer.cells.length > 0);
      }),
    };
  }

  private isInBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.widthTiles && y < this.heightTiles;
  }

  private loadGeneratedTerrainTextures(
    asset: TerrainVisualAsset,
    onComplete: () => void
  ) {
    const atlasKey = terrainAtlasKey(asset.id);
    const centerKey = terrainCenterVariantsKey(asset.id);

    if (this.textures.exists(atlasKey)) {
      this.textures.remove(atlasKey);
    }
    if (this.textures.exists(centerKey)) {
      this.textures.remove(centerKey);
    }

    this.load.image(atlasKey, asset.atlasUrl);
    this.load.image(centerKey, asset.centerVariantsUrl);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const changedLayers = this.layers.values();

      for (const terrainLayers of changedLayers) {
        const layer = terrainLayers.get(asset.id);
        if (layer) {
          layer.dirty = true;
        }
      }

      onComplete();
    });
    this.load.start();
  }
}

export function validateStudioMap(
  value: unknown
): asserts value is StudioMapExport {
  if (!value || typeof value !== "object") {
    throw new Error("Map file must be an object.");
  }

  const map = value as Partial<StudioMapExport>;
  if (map.version !== 1) {
    throw new Error("Unsupported map version.");
  }

  if (!isValidWorldSize(map.width) || !isValidWorldSize(map.height)) {
    throw new Error("Map dimensions must be between 5 and 200.");
  }

  if (map.tileSize !== TILE_SIZE || map.baseTerrain !== BASE_TERRAIN) {
    throw new Error("Map tile size or base terrain is not supported.");
  }

  if (!Array.isArray(map.layers)) {
    throw new Error("Map layers must be an array.");
  }

  for (const layer of map.layers) {
    if (!layer || typeof layer.terrainId !== "string") {
      throw new Error("Map includes an unknown terrain layer.");
    }

    if (layer.layer !== undefined && !isValidLayer(layer.layer)) {
      throw new Error("Map includes an invalid numeric layer.");
    }

    if (!Array.isArray(layer.cells)) {
      throw new Error("Map layer cells must be an array.");
    }

    for (const cell of layer.cells) {
      if (!Array.isArray(cell)) {
        throw new Error("Map includes an invalid cell.");
      }

      const [x, y] = cell;
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= map.width ||
        y >= map.height
      ) {
        throw new Error("Map includes an out-of-bounds cell.");
      }
    }
  }
}

function isValidWorldSize(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= MIN_WORLD_SIZE &&
    (value as number) <= MAX_WORLD_SIZE
  );
}

function isValidLayer(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= STUDIO_LAYER_COUNT
  );
}

export function terrainLabel(terrainId: TerrainVisualAssetId) {
  return terrainId
    .replace("uniswap-", "")
    .replace("forest-floor", "forest")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mergeTerrainAssets(customAssets: TerrainVisualAsset[]) {
  const assets = BUILT_IN_TERRAIN_VISUAL_ASSET_IDS.map(
    (assetId) => TERRAIN_VISUAL_ASSETS[assetId]
  );

  for (const asset of customAssets) {
    if (!asset.id || !asset.atlasUrl || !asset.centerVariantsUrl) {
      continue;
    }

    const existingIndex = assets.findIndex(
      (terrainAsset) => terrainAsset.id === asset.id
    );

    if (existingIndex >= 0) {
      assets[existingIndex] = asset;
    } else {
      assets.push(asset);
    }
  }

  return assets;
}
