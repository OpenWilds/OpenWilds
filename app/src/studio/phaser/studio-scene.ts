import Phaser from "phaser";
import {
  terrainAtlasKey,
  terrainCenterVariantsKey,
  type TerrainVisualAsset,
  type TerrainVisualAssetId,
} from "../../assets/visual-assets";
import {
  cellKey,
  renderAutotileLayer,
  type TerrainGridLayer,
} from "../../game/autotile";

export const STUDIO_WIDTH = 1280;
export const STUDIO_HEIGHT = 820;

const MIN_WORLD_SIZE = 5;
const MAX_WORLD_SIZE = 200;
const DEFAULT_WORLD_SIZE = 40;
const TILE_SIZE = 32;
const GRID_DEPTH = 500;
const STUDIO_LAYER_COUNT = 5;

export const STUDIO_LAYER_OPTIONS = Array.from(
  { length: STUDIO_LAYER_COUNT },
  (_, index) => index + 1
);

type PaintMode = "paint" | "erase";
type StudioToolMode = "terrain" | "object";
type ObjectPaintMode = "place" | "erase";

export type StudioObjectCategory = "plants";

export type StudioObjectSpriteAsset = {
  id: string;
  label: string;
  category: StudioObjectCategory;
  kind: "plant" | "tree";
  imageUrl: string;
  frameSize: number;
  rows: number;
  columns: number;
};

type StudioObjectPlacementExport = {
  category: StudioObjectCategory;
  assetId: string;
  x: number;
  y: number;
  frame: number;
};

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
  objectAssets?: StudioObjectSpriteAsset[];
  objects?: StudioObjectPlacementExport[];
  layers: StudioMapLayerExport[];
};

type StudioSceneOptions = {
  baseTerrain?: TerrainVisualAssetId;
  height?: number;
  objectAssets?: StudioObjectSpriteAsset[];
  terrainAssets?: TerrainVisualAsset[];
  width?: number;
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
  toolMode: StudioToolMode;
  selectedLayer: number;
  selectedTerrain: TerrainVisualAssetId;
  selectedObject: string;
  selectedObjectFrame: number;
  brushSize: number;
  paintMode: PaintMode;
  objectPaintMode: ObjectPaintMode;
  showGrid: boolean;
  activeLayerCellCount: number;
  objectCount: number;
  message: string;
};

type StudioObjectPlacement = StudioObjectPlacementExport & {
  image: Phaser.GameObjects.Image;
};

export class StudioScene extends Phaser.Scene {
  private readonly options: StudioSceneOptions;
  private widthTiles = DEFAULT_WORLD_SIZE;
  private heightTiles = DEFAULT_WORLD_SIZE;
  private selectedLayer = 1;
  private selectedTerrain: TerrainVisualAssetId = "";
  private selectedObject = "";
  private selectedObjectFrame = 0;
  private baseTerrain: TerrainVisualAssetId = "";
  private brushSize = 1;
  private paintMode: PaintMode = "paint";
  private objectPaintMode: ObjectPaintMode = "place";
  private toolMode: StudioToolMode = "terrain";
  private showGrid = true;
  private isPainting = false;
  private isPanning = false;
  private panStart: Phaser.Math.Vector2 | null = null;
  private cameraStart: Phaser.Math.Vector2 | null = null;
  private lastPaintKey = "";
  private worldLayer!: Phaser.GameObjects.Container;
  private objectLayer!: Phaser.GameObjects.Container;
  private objectPreviewLayer!: Phaser.GameObjects.Container;
  private objectPreviewImage: Phaser.GameObjects.Image | null = null;
  private objectPreviewBorder: Phaser.GameObjects.Rectangle | null = null;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private terrainAssets: TerrainVisualAsset[];
  private objectAssets: StudioObjectSpriteAsset[];
  private paintableTerrains: TerrainVisualAssetId[];
  private objectPlacements = new Map<string, StudioObjectPlacement>();
  private isReady = false;
  private readonly layers = new Map<
    number,
    Map<TerrainVisualAssetId, StudioLayer>
  >();

  constructor(options: StudioSceneOptions) {
    super("studio-scene");
    this.options = options;
    this.widthTiles = options.width ?? DEFAULT_WORLD_SIZE;
    this.heightTiles = options.height ?? DEFAULT_WORLD_SIZE;
    this.terrainAssets = mergeTerrainAssets(options.terrainAssets ?? []);
    this.objectAssets = mergeObjectAssets(options.objectAssets ?? []);
    this.baseTerrain = options.baseTerrain ?? this.terrainAssets[0]?.id ?? "";
    this.paintableTerrains = this.getPaintableTerrainIds();
    this.selectedTerrain = this.paintableTerrains[0] ?? this.baseTerrain;
    this.selectedObject = this.objectAssets[0]?.id ?? "";
    this.selectedObjectFrame = this.objectAssets[0]
      ? getDefaultObjectFrame(this.objectAssets[0])
      : 0;
  }

  preload() {
    for (const asset of this.terrainAssets) {
      this.load.image(terrainAtlasKey(asset.id), asset.atlasUrl);
      this.load.image(
        terrainCenterVariantsKey(asset.id),
        asset.centerVariantsUrl
      );
    }

    for (const asset of this.objectAssets) {
      this.load.image(studioObjectSpriteKey(asset.id), asset.imageUrl);
    }
  }

  create() {
    this.input.mouse?.disableContextMenu();
    this.cameras.main.setBackgroundColor("#17211e");
    this.worldLayer = this.add.container(0, 0).setDepth(0);
    this.objectLayer = this.add.container(0, 0).setDepth(420);
    this.objectPreviewLayer = this.add.container(0, 0).setDepth(470);
    this.gridGraphics = this.add.graphics().setDepth(GRID_DEPTH);
    this.isReady = true;

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
    this.applyMap(map);
  }

  async loadMap(map: StudioMapExport) {
    validateStudioMap(map);

    for (const asset of map.terrainAssets ?? []) {
      this.addTerrainAsset(asset, false);
    }
    for (const asset of map.objectAssets ?? []) {
      this.addObjectAsset(asset, false);
    }

    this.widthTiles = map.width;
    this.heightTiles = map.height;
    this.baseTerrain = map.baseTerrain;
    this.paintableTerrains = this.getPaintableTerrainIds();
    this.selectedTerrain = this.paintableTerrains[0] ?? this.baseTerrain;

    await this.ensureTerrainAssetsLoaded(this.terrainAssets);
    await this.ensureObjectAssetsLoaded(this.objectAssets);
    this.applyMap(map);
  }

  private applyMap(map: StudioMapExport) {
    this.widthTiles = map.width;
    this.heightTiles = map.height;

    for (const asset of map.terrainAssets ?? []) {
      this.addTerrainAsset(asset, false);
    }
    for (const asset of map.objectAssets ?? []) {
      this.addObjectAsset(asset, false);
    }

    if (map.baseTerrain) {
      this.baseTerrain = map.baseTerrain;
      this.paintableTerrains = this.getPaintableTerrainIds();
      this.selectedTerrain = this.paintableTerrains[0] ?? this.baseTerrain;
      this.createLayers();
    }

    for (const terrainLayers of this.layers.values()) {
      for (const layer of terrainLayers.values()) {
        layer.cells.clear();
        layer.dirty = true;
      }
    }

    for (const [key, placement] of [...this.objectPlacements]) {
      if (!this.isInBounds(placement.x, placement.y)) {
        placement.image.destroy();
        this.objectPlacements.delete(key);
      }
    }

    this.fillBaseLayer();
    for (const exportedLayer of map.layers) {
      if (exportedLayer.terrainId === this.baseTerrain) {
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

    this.clearObjectPlacements();
    for (const object of map.objects ?? []) {
      this.placeObjectAt(object.x, object.y, object.assetId, object.frame);
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

  setToolMode(mode: StudioToolMode) {
    this.toolMode = mode;
    this.updateStatus();
  }

  setObjectPaintMode(mode: ObjectPaintMode) {
    this.objectPaintMode = mode;
    this.updateStatus();
  }

  setSelectedObject(assetId: string) {
    const asset = this.objectAssets.find(
      (candidate) => candidate.id === assetId
    );
    if (!asset) {
      return;
    }

    this.selectedObject = assetId;
    if (
      this.selectedObjectFrame < 0 ||
      this.selectedObjectFrame >= asset.rows * asset.columns
    ) {
      this.selectedObjectFrame = getDefaultObjectFrame(asset);
    }
    this.refreshObjectPreview();
    this.updateStatus();
  }

  setSelectedObjectVariant(assetId: string, frame: number) {
    const asset = this.objectAssets.find(
      (candidate) => candidate.id === assetId
    );
    if (!asset) {
      return;
    }

    const frameCount = asset.rows * asset.columns;
    this.selectedObject = assetId;
    this.selectedObjectFrame = Math.min(
      frameCount - 1,
      Math.max(0, Math.floor(frame))
    );
    this.refreshObjectPreview();
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

  clearObjects() {
    this.clearObjectPlacements();
    this.updateStatus("Cleared placed objects");
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

  setBaseTerrain(terrainId: TerrainVisualAssetId) {
    const terrainAsset = this.terrainAssets.find(
      (asset) => asset.id === terrainId
    );
    if (!terrainAsset) {
      this.updateStatus("Choose a generated terrain for layer 0 first.");
      return false;
    }

    this.baseTerrain = terrainId;
    this.paintableTerrains = this.getPaintableTerrainIds();
    this.selectedTerrain = this.paintableTerrains[0] ?? this.baseTerrain;
    if (!this.isReady) {
      return true;
    }

    if (!this.hasTerrainTextures(terrainAsset)) {
      this.updateStatus(`Loading ${terrainLabel(terrainId)} for layer 0...`);
      this.loadGeneratedTerrainTextures(terrainAsset, () => {
        if (this.baseTerrain === terrainId) {
          this.rebuildLayersForBaseTerrain(terrainId);
        }
      });
      return true;
    }

    this.rebuildLayersForBaseTerrain(terrainId);
    return true;
  }

  private rebuildLayersForBaseTerrain(terrainId: TerrainVisualAssetId) {
    this.createLayers();
    this.renderAllLayers();
    this.updateStatus(`Layer 0 set to ${terrainLabel(terrainId)}`);
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
    const existingAsset =
      existingIndex >= 0 ? this.terrainAssets[existingIndex] : null;
    const shouldLoadTextures =
      this.isReady &&
      (!this.hasTerrainTextures(normalizedAsset) ||
        existingAsset?.atlasUrl !== normalizedAsset.atlasUrl ||
        existingAsset?.centerVariantsUrl !== normalizedAsset.centerVariantsUrl);

    if (existingIndex >= 0) {
      this.terrainAssets[existingIndex] = normalizedAsset;
    } else {
      this.terrainAssets.push(normalizedAsset);
    }

    if (!this.baseTerrain) {
      this.baseTerrain = normalizedAsset.id;
    }

    this.paintableTerrains = this.getPaintableTerrainIds();
    if (this.isReady && normalizedAsset.id !== this.baseTerrain) {
      this.addLayerForTerrain(normalizedAsset.id);
    }

    if (!this.isReady || !shouldLoadTextures) {
      if (selectAfterLoad && normalizedAsset.id !== this.baseTerrain) {
        this.setSelectedTerrain(normalizedAsset.id);
      }
      this.markTerrainLayersDirty(normalizedAsset.id);
      this.updateStatus(`Added ${terrainLabel(normalizedAsset.id)}`);
      return;
    }

    this.loadGeneratedTerrainTextures(normalizedAsset, () => {
      if (selectAfterLoad && normalizedAsset.id !== this.baseTerrain) {
        this.setSelectedTerrain(normalizedAsset.id);
      }
      this.markTerrainLayersDirty(normalizedAsset.id);
      this.updateStatus(`Added ${terrainLabel(normalizedAsset.id)}`);
    });
  }

  addObjectAsset(asset: StudioObjectSpriteAsset, selectAfterLoad = true) {
    const normalizedAsset = normalizeObjectAsset(asset);
    const existingIndex = this.objectAssets.findIndex(
      (objectAsset) => objectAsset.id === normalizedAsset.id
    );
    const existingAsset =
      existingIndex >= 0 ? this.objectAssets[existingIndex] : null;
    const shouldLoadSprite =
      this.isReady &&
      (!this.hasObjectTexture(normalizedAsset) ||
        existingAsset?.imageUrl !== normalizedAsset.imageUrl ||
        existingAsset?.frameSize !== normalizedAsset.frameSize);

    if (existingIndex >= 0) {
      this.objectAssets[existingIndex] = normalizedAsset;
    } else {
      this.objectAssets.push(normalizedAsset);
    }

    if (!this.selectedObject) {
      this.selectedObject = normalizedAsset.id;
    }

    if (!this.isReady) {
      if (selectAfterLoad) {
        this.selectedObject = normalizedAsset.id;
      }
      return;
    }

    if (!shouldLoadSprite) {
      if (selectAfterLoad) {
        this.setSelectedObject(normalizedAsset.id);
      }
      this.updateObjectPlacementTextures(normalizedAsset.id);
      this.updateStatus(`Added ${normalizedAsset.label}`);
      return;
    }

    this.loadObjectSpriteAsset(normalizedAsset, () => {
      if (selectAfterLoad) {
        this.setSelectedObject(normalizedAsset.id);
      }
      this.updateObjectPlacementTextures(normalizedAsset.id);
      this.updateStatus(`Added ${normalizedAsset.label}`);
    });
  }

  getState(): StudioSceneState {
    const activeLayer = this.getLayer(this.selectedLayer, this.selectedTerrain);

    return {
      width: this.widthTiles,
      height: this.heightTiles,
      toolMode: this.toolMode,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      selectedObject: this.selectedObject,
      selectedObjectFrame: this.selectedObjectFrame,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      objectPaintMode: this.objectPaintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: activeLayer?.cells.size ?? 0,
      objectCount: this.objectPlacements.size,
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
          this.baseTerrain,
          {
            assetId: this.baseTerrain,
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
    const baseLayer = this.getLayer(0, this.baseTerrain);
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

  private hasTerrainTextures(asset: TerrainVisualAsset) {
    return (
      this.textures.exists(terrainAtlasKey(asset.id)) &&
      this.textures.exists(terrainCenterVariantsKey(asset.id))
    );
  }

  private markTerrainLayersDirty(assetId: TerrainVisualAssetId) {
    for (const terrainLayers of this.layers.values()) {
      const layer = terrainLayers.get(assetId);
      if (layer) {
        layer.dirty = true;
      }
    }
  }

  private registerInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown() || pointer.rightButtonDown()) {
        this.startPan(pointer);
        return;
      }

      this.isPainting = true;
      this.lastPaintKey = "";
      this.applyToolAtPointer(pointer);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning) {
        this.panCamera(pointer);
        return;
      }

      this.updateObjectPreviewAtPointer(pointer);

      if (this.isPainting) {
        this.applyToolAtPointer(pointer);
      }
    });

    this.input.on("pointerup", () => {
      this.isPainting = false;
      this.isPanning = false;
      this.lastPaintKey = "";
    });

    this.input.on("pointerout", () => {
      this.hideObjectPreview();
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
          this.cameras.main.zoom * (deltaY > 0 ? 0.88 : 1.16),
          0.15,
          8
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

  private applyToolAtPointer(pointer: Phaser.Input.Pointer) {
    if (this.toolMode === "object") {
      this.placeObjectAtPointer(pointer);
      return;
    }

    this.paintAtPointer(pointer);
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

  private placeObjectAtPointer(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    if (!this.isInBounds(tileX, tileY)) {
      return;
    }

    const stampKey = `${tileX},${tileY},object,${this.objectPaintMode},${this.selectedObject},${this.selectedObjectFrame}`;
    if (stampKey === this.lastPaintKey) {
      return;
    }
    this.lastPaintKey = stampKey;

    if (this.objectPaintMode === "erase") {
      this.removeObjectAt(tileX, tileY);
      this.updateStatus();
      return;
    }

    this.placeObjectAt(
      tileX,
      tileY,
      this.selectedObject,
      this.selectedObjectFrame
    );
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

  private updateObjectPreviewAtPointer(pointer: Phaser.Input.Pointer) {
    if (this.toolMode !== "object") {
      this.hideObjectPreview();
      return;
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    if (!this.isInBounds(tileX, tileY)) {
      this.hideObjectPreview();
      return;
    }

    const border = this.ensureObjectPreviewBorder();
    border
      .setPosition(
        tileX * TILE_SIZE + TILE_SIZE / 2,
        tileY * TILE_SIZE + TILE_SIZE / 2
      )
      .setVisible(true);

    if (this.objectPaintMode === "erase") {
      this.objectPreviewImage?.setVisible(false);
      return;
    }

    const asset = this.objectAssets.find(
      (candidate) => candidate.id === this.selectedObject
    );
    if (!asset || !this.textures.exists(studioObjectSpriteKey(asset.id))) {
      this.objectPreviewImage?.setVisible(false);
      return;
    }

    const image = this.ensureObjectPreviewImage(asset);
    const frameSize = this.applyObjectFrameTexture(
      image,
      asset,
      this.selectedObjectFrame
    );
    const displaySize = getObjectFrameDisplaySize(
      asset,
      this.selectedObjectFrame,
      frameSize
    );
    image
      .setPosition(
        tileX * TILE_SIZE + TILE_SIZE / 2,
        tileY * TILE_SIZE + TILE_SIZE / 2
      )
      .setOrigin(0.5, 0.5)
      .setDisplaySize(displaySize.width, displaySize.height)
      .setVisible(true);
  }

  private refreshObjectPreview() {
    if (this.objectPreviewImage) {
      this.objectPreviewImage.destroy();
      this.objectPreviewImage = null;
    }
  }

  private hideObjectPreview() {
    this.objectPreviewImage?.setVisible(false);
    this.objectPreviewBorder?.setVisible(false);
  }

  private ensureObjectPreviewBorder() {
    if (!this.objectPreviewBorder) {
      this.objectPreviewBorder = this.add
        .rectangle(0, 0, TILE_SIZE, TILE_SIZE)
        .setStrokeStyle(2, 0x93b9ff, 0.95)
        .setFillStyle(0x2563eb, 0.08)
        .setVisible(false);
      this.objectPreviewLayer.add(this.objectPreviewBorder);
    }

    return this.objectPreviewBorder;
  }

  private ensureObjectPreviewImage(asset: StudioObjectSpriteAsset) {
    if (!this.objectPreviewImage) {
      this.objectPreviewImage = this.add
        .image(0, 0, studioObjectSpriteKey(asset.id))
        .setOrigin(0.5, 0.82)
        .setAlpha(0.48)
        .setVisible(false);
      this.objectPreviewLayer.add(this.objectPreviewImage);
    }

    return this.objectPreviewImage;
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

  private placeObjectAt(x: number, y: number, assetId: string, frame?: number) {
    if (!this.isInBounds(x, y)) {
      return;
    }

    const asset = this.objectAssets.find(
      (candidate) => candidate.id === assetId
    );
    if (
      !asset ||
      !this.textures ||
      !this.textures.exists(studioObjectSpriteKey(asset.id))
    ) {
      return;
    }

    const key = cellKey(x, y);
    this.removeObjectAt(x, y);

    const selectedFrame = frame ?? getDefaultObjectFrame(asset);
    const image = this.add
      .image(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        studioObjectSpriteKey(asset.id)
      )
      .setOrigin(0.5, 0.5)
      .setDepth(y);
    const frameSize = this.applyObjectFrameTexture(image, asset, selectedFrame);
    const displaySize = getObjectFrameDisplaySize(
      asset,
      selectedFrame,
      frameSize
    );
    image.setDisplaySize(displaySize.width, displaySize.height);

    this.objectLayer.add(image);
    this.objectPlacements.set(key, {
      category: asset.category,
      assetId: asset.id,
      x,
      y,
      frame: selectedFrame,
      image,
    });
  }

  private removeObjectAt(x: number, y: number) {
    const key = cellKey(x, y);
    const placement = this.objectPlacements.get(key);

    if (!placement) {
      return;
    }

    placement.image.destroy();
    this.objectPlacements.delete(key);
  }

  private clearObjectPlacements() {
    for (const placement of this.objectPlacements.values()) {
      placement.image.destroy();
    }

    this.objectPlacements.clear();
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
    const viewportWidth = this.scale.width || STUDIO_WIDTH;
    const viewportHeight = this.scale.height || STUDIO_HEIGHT;

    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.centerOn(worldWidth / 2, worldHeight / 2);
    this.cameras.main.setZoom(
      Math.min(1.2, viewportWidth / worldWidth, viewportHeight / worldHeight)
    );
  }

  private updateStatus(message?: string) {
    const activeLayer = this.getLayer(this.selectedLayer, this.selectedTerrain);
    const cellCount = activeLayer?.cells.size ?? 0;
    this.options.onStateChange?.({
      width: this.widthTiles,
      height: this.heightTiles,
      toolMode: this.toolMode,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      selectedObject: this.selectedObject,
      selectedObjectFrame: this.selectedObjectFrame,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      objectPaintMode: this.objectPaintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: cellCount,
      objectCount: this.objectPlacements.size,
      message: message ?? "Drag to paint. Right/middle drag pans. Wheel zooms.",
    });
  }

  private exportMap(): StudioMapExport {
    return {
      version: 1,
      width: this.widthTiles,
      height: this.heightTiles,
      tileSize: TILE_SIZE,
      baseTerrain: this.baseTerrain,
      terrainAssets: this.terrainAssets.filter((asset) => asset.generated),
      objectAssets: this.getUsedObjectAssets(),
      objects: [...this.objectPlacements.values()]
        .map((object) => ({
          category: object.category,
          assetId: object.assetId,
          x: object.x,
          y: object.y,
          frame: object.frame,
        }))
        .sort(
          (a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId)
        ),
      layers: STUDIO_LAYER_OPTIONS.flatMap((slot) => {
        const terrainLayers = this.layers.get(slot);
        if (!terrainLayers) {
          return [];
        }

        return this.paintableTerrains
          .map((terrainId) => {
            const layer = terrainLayers.get(terrainId);
            const cells = [...(layer?.cells ?? [])]
              .map((key) => key.split(",").map(Number) as [number, number])
              .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);

            return { layer: slot, terrainId, cells };
          })
          .filter((layer) => layer.cells.length > 0);
      }),
    };
  }

  private isInBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.widthTiles && y < this.heightTiles;
  }

  private getPaintableTerrainIds() {
    return this.terrainAssets
      .map((terrainAsset) => terrainAsset.id)
      .filter((assetId) => assetId !== this.baseTerrain);
  }

  private loadGeneratedTerrainTextures(
    asset: TerrainVisualAsset,
    onComplete: () => void
  ) {
    void this.ensureTerrainAssetsLoaded([asset]).then(onComplete);
  }

  private ensureTerrainAssetsLoaded(assets: TerrainVisualAsset[]) {
    if (!this.isReady) {
      return Promise.resolve();
    }

    const assetsToLoad = assets.filter(
      (asset) => !this.hasTerrainTextures(asset)
    );
    if (!assetsToLoad.length) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onComplete = () => {
        this.load.off(Phaser.Loader.Events.LOAD_ERROR, onLoadError);

        for (const asset of assetsToLoad) {
          this.markTerrainLayersDirty(asset.id);
        }

        resolve();
      };
      const onLoadError = (file: Phaser.Loader.File) => {
        this.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
        reject(new Error(`Could not load terrain asset: ${file.key}`));
      };

      this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
      this.load.once(Phaser.Loader.Events.LOAD_ERROR, onLoadError);

      for (const asset of assetsToLoad) {
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
      }

      this.load.start();
    });
  }

  private hasObjectTexture(asset: StudioObjectSpriteAsset) {
    return this.textures.exists(studioObjectSpriteKey(asset.id));
  }

  private loadObjectSpriteAsset(
    asset: StudioObjectSpriteAsset,
    onComplete: () => void
  ) {
    if (!this.isReady) {
      onComplete();
      return;
    }

    const key = studioObjectSpriteKey(asset.id);
    const onLoadComplete = () => {
      this.load.off(Phaser.Loader.Events.LOAD_ERROR, onLoadError);
      onComplete();
    };
    const onLoadError = (file: Phaser.Loader.File) => {
      this.load.off(Phaser.Loader.Events.COMPLETE, onLoadComplete);
      this.updateStatus(`Could not load object asset: ${file.key}`);
    };

    this.load.once(Phaser.Loader.Events.COMPLETE, onLoadComplete);
    this.load.once(Phaser.Loader.Events.LOAD_ERROR, onLoadError);

    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
    this.removeObjectVariantTextures(asset);

    this.load.image(key, asset.imageUrl);
    this.load.start();
  }

  private ensureObjectAssetsLoaded(assets: StudioObjectSpriteAsset[]) {
    if (!this.isReady) {
      return Promise.resolve();
    }

    const assetsToLoad = assets.filter(
      (asset) => !this.hasObjectTexture(asset)
    );
    if (!assetsToLoad.length) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onComplete = () => {
        this.load.off(Phaser.Loader.Events.LOAD_ERROR, onLoadError);
        resolve();
      };
      const onLoadError = (file: Phaser.Loader.File) => {
        this.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
        reject(new Error(`Could not load object asset: ${file.key}`));
      };

      this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
      this.load.once(Phaser.Loader.Events.LOAD_ERROR, onLoadError);

      for (const asset of assetsToLoad) {
        const key = studioObjectSpriteKey(asset.id);

        if (this.textures.exists(key)) {
          this.textures.remove(key);
        }
        this.removeObjectVariantTextures(asset);

        this.load.image(key, asset.imageUrl);
      }

      this.load.start();
    });
  }

  private updateObjectPlacementTextures(assetId: string) {
    const asset = this.objectAssets.find(
      (candidate) => candidate.id === assetId
    );
    if (
      !this.isReady ||
      !this.textures ||
      !asset ||
      !this.textures.exists(studioObjectSpriteKey(asset.id))
    ) {
      return;
    }

    for (const placement of this.objectPlacements.values()) {
      if (placement.assetId !== assetId) {
        continue;
      }

      const frameSize = this.applyObjectFrameTexture(
        placement.image,
        asset,
        placement.frame
      );
      const displaySize = getObjectFrameDisplaySize(
        asset,
        placement.frame,
        frameSize
      );
      placement.image
        .setPosition(
          placement.x * TILE_SIZE + TILE_SIZE / 2,
          placement.y * TILE_SIZE + TILE_SIZE / 2
        )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(displaySize.width, displaySize.height);
    }
  }

  private applyObjectFrameTexture(
    image: Phaser.GameObjects.Image,
    asset: StudioObjectSpriteAsset,
    frame: number
  ) {
    const frameTexture = this.ensureObjectVariantTexture(asset, frame);
    image.setTexture(frameTexture.key);
    image.setCrop(0, 0, frameTexture.width, frameTexture.height);
    return frameTexture;
  }

  private ensureObjectVariantTexture(
    asset: StudioObjectSpriteAsset,
    frame: number
  ) {
    const textureKey = studioObjectVariantKey(asset.id, frame);
    const crop = this.getObjectFrameCrop(asset, frame);

    if (this.textures.exists(textureKey)) {
      return {
        key: textureKey,
        width: crop.width,
        height: crop.height,
      };
    }

    const source = this.textures
      .get(studioObjectSpriteKey(asset.id))
      .getSourceImage() as CanvasImageSource;
    const texture = this.textures.createCanvas(
      textureKey,
      crop.width,
      crop.height
    );

    if (!texture) {
      return {
        key: studioObjectSpriteKey(asset.id),
        width: crop.width,
        height: crop.height,
      };
    }

    const context = texture.getContext();
    context.clearRect(0, 0, crop.width, crop.height);
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    texture.refresh();

    return {
      key: textureKey,
      width: crop.width,
      height: crop.height,
    };
  }

  private removeObjectVariantTextures(asset: StudioObjectSpriteAsset) {
    for (let frame = 0; frame < asset.rows * asset.columns; frame += 1) {
      const key = studioObjectVariantKey(asset.id, frame);
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
  }

  private getObjectFrameCrop(asset: StudioObjectSpriteAsset, frame: number) {
    const texture = this.textures.get(studioObjectSpriteKey(asset.id));
    const source = texture.getSourceImage() as {
      width?: number;
      height?: number;
    };
    const textureWidth =
      Number(source?.width) || asset.columns * asset.frameSize;
    const textureHeight =
      Number(source?.height) || asset.rows * asset.frameSize;
    const frameWidth = textureWidth / asset.columns;
    const frameHeight = textureHeight / asset.rows;
    const boundedFrame = Phaser.Math.Clamp(
      frame,
      0,
      asset.rows * asset.columns - 1
    );
    const column = boundedFrame % asset.columns;
    const row = Math.floor(boundedFrame / asset.columns);

    return {
      x: Math.round(column * frameWidth),
      y: Math.round(row * frameHeight),
      width: Math.round(frameWidth),
      height: Math.round(frameHeight),
    };
  }

  private getUsedObjectAssets() {
    const usedAssetIds = new Set(
      [...this.objectPlacements.values()].map((object) => object.assetId)
    );

    return this.objectAssets.filter((asset) => usedAssetIds.has(asset.id));
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

  if (map.tileSize !== TILE_SIZE || typeof map.baseTerrain !== "string") {
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

  if (map.objectAssets !== undefined && !Array.isArray(map.objectAssets)) {
    throw new Error("Map object assets must be an array.");
  }

  for (const asset of map.objectAssets ?? []) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      typeof asset.label !== "string" ||
      asset.category !== "plants" ||
      !["plant", "tree"].includes(asset.kind) ||
      typeof asset.imageUrl !== "string" ||
      !Number.isInteger(asset.frameSize) ||
      !Number.isInteger(asset.rows) ||
      !Number.isInteger(asset.columns)
    ) {
      throw new Error("Map includes an invalid object asset.");
    }
  }

  if (map.objects !== undefined && !Array.isArray(map.objects)) {
    throw new Error("Map objects must be an array.");
  }

  for (const object of map.objects ?? []) {
    if (
      !object ||
      object.category !== "plants" ||
      typeof object.assetId !== "string" ||
      !Number.isInteger(object.x) ||
      !Number.isInteger(object.y) ||
      !Number.isInteger(object.frame) ||
      object.x < 0 ||
      object.y < 0 ||
      object.x >= map.width ||
      object.y >= map.height
    ) {
      throw new Error("Map includes an invalid object placement.");
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

function mergeObjectAssets(assets: StudioObjectSpriteAsset[]) {
  const merged = new Map<string, StudioObjectSpriteAsset>();

  for (const asset of assets) {
    const normalizedAsset = normalizeObjectAsset(asset);
    if (!normalizedAsset.id || !normalizedAsset.imageUrl) {
      continue;
    }

    merged.set(normalizedAsset.id, normalizedAsset);
  }

  return [...merged.values()];
}

function normalizeObjectAsset(asset: StudioObjectSpriteAsset) {
  const id = asset.id.trim();
  const frameSize = Math.max(16, Math.floor(asset.frameSize));
  const rows = Math.max(1, Math.floor(asset.rows));
  const columns = Math.max(1, Math.floor(asset.columns));

  return {
    ...asset,
    id,
    label: asset.label.trim() || objectLabel(id),
    category: asset.category,
    kind: asset.kind,
    imageUrl: asset.imageUrl.trim(),
    frameSize,
    rows,
    columns,
  };
}

function studioObjectSpriteKey(assetId: string) {
  return `studio-object-sprite-${assetId}`;
}

function studioObjectVariantKey(assetId: string, frame: number) {
  return `${studioObjectSpriteKey(assetId)}-variant-${frame}`;
}

function getDefaultObjectFrame(asset: StudioObjectSpriteAsset) {
  const grownRow = Math.min(2, asset.rows - 1);
  return grownRow * asset.columns;
}

function getObjectFrameDisplaySize(
  asset: StudioObjectSpriteAsset,
  frame: number,
  frameSize: {
    width: number;
    height: number;
  }
) {
  const scale = Math.min(
    TILE_SIZE / frameSize.width,
    TILE_SIZE / frameSize.height
  );
  const objectScale = getObjectFrameScale(asset, frame);

  return {
    width: frameSize.width * scale * objectScale,
    height: frameSize.height * scale * objectScale,
  };
}

function getObjectFrameScale(asset: StudioObjectSpriteAsset, frame: number) {
  if (asset.kind !== "tree") {
    return 1;
  }

  const row = Math.floor(frame / asset.columns);
  const column = frame % asset.columns;
  const growingRow = Math.min(1, asset.rows - 1);
  const grownRow = Math.min(2, asset.rows - 1);

  if (row !== growingRow && row !== grownRow) {
    return 1;
  }

  return 1 + column * 0.15;
}

function objectLabel(objectId: string) {
  return objectId
    .replace(/-/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function terrainLabel(terrainId: TerrainVisualAssetId) {
  return terrainId
    .replace("uniswap-", "")
    .replace("forest-floor", "forest")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mergeTerrainAssets(customAssets: TerrainVisualAsset[]) {
  const assets: TerrainVisualAsset[] = [];

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
