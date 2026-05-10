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
const MIN_CAMERA_ZOOM = 0.15;
const MAX_CAMERA_ZOOM = 8;
const WHEEL_PINCH_ZOOM_DIVISOR = 150;
const DEFAULT_STUDIO_HELP =
  "Drag to paint. Right/middle drag or two-finger swipe pans. Pinch zooms.";
const MAX_UNDO_HISTORY = 80;
const OBJECT_FOOTPRINT_KEY_DELTAS: Record<
  string,
  { width: number; height: number }
> = {
  ArrowDown: { width: 0, height: -1 },
  ArrowLeft: { width: -1, height: 0 },
  ArrowRight: { width: 1, height: 0 },
  ArrowUp: { width: 0, height: 1 },
};

export const STUDIO_LAYER_OPTIONS = Array.from(
  { length: STUDIO_LAYER_COUNT },
  (_, index) => index + 1
);

type PaintMode = "paint" | "erase";
type StudioToolMode = "terrain" | "object";
type ObjectPaintMode = "place" | "erase" | "select";

export type StudioObjectCategory = "plants" | "buildings" | "objects";

export type StudioObjectSpriteAsset = {
  id: string;
  label: string;
  category: StudioObjectCategory;
  kind: "plant" | "tree" | "building" | "object";
  imageUrl: string;
  frameSize: number;
  rows: number;
  columns: number;
};

type StudioObjectPlacementExport = {
  category: StudioObjectCategory;
  assetId: string;
  layer?: number;
  x: number;
  y: number;
  frame: number;
  width?: number;
  height?: number;
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
  baseTerrain: TerrainVisualAssetId;
  toolMode: StudioToolMode;
  selectedLayer: number;
  selectedTerrain: TerrainVisualAssetId;
  selectedObject: string;
  selectedObjectFrame: number;
  objectFootprintWidth: number;
  objectFootprintHeight: number;
  brushSize: number;
  paintMode: PaintMode;
  objectPaintMode: ObjectPaintMode;
  showGrid: boolean;
  activeLayerCellCount: number;
  objectCount: number;
  hasSelectedObjectPlacement: boolean;
  canUndo: boolean;
  message: string;
};

type StudioObjectPlacement = StudioObjectPlacementExport & {
  image: Phaser.GameObjects.Image;
  layer: number;
  width: number;
  height: number;
};

type TouchGestureState = {
  center: Phaser.Math.Vector2;
  distance: number;
};

type CameraViewportState = {
  scrollX: number;
  scrollY: number;
  zoom: number;
};

export class StudioScene extends Phaser.Scene {
  private readonly options: StudioSceneOptions;
  private widthTiles = DEFAULT_WORLD_SIZE;
  private heightTiles = DEFAULT_WORLD_SIZE;
  private selectedLayer = 1;
  private selectedTerrain: TerrainVisualAssetId = "";
  private selectedObject = "";
  private selectedObjectFrame = 0;
  private objectFootprintWidth = 1;
  private objectFootprintHeight = 1;
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
  private touchGesture: TouchGestureState | null = null;
  private lastPaintKey = "";
  private worldLayer!: Phaser.GameObjects.Container;
  private objectLayer!: Phaser.GameObjects.Container;
  private objectPreviewLayer!: Phaser.GameObjects.Container;
  private objectPreviewImage: Phaser.GameObjects.Image | null = null;
  private objectPreviewBorder: Phaser.GameObjects.Rectangle | null = null;
  private selectedObjectBorder: Phaser.GameObjects.Rectangle | null = null;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private terrainAssets: TerrainVisualAsset[];
  private objectAssets: StudioObjectSpriteAsset[];
  private paintableTerrains: TerrainVisualAssetId[];
  private objectPlacements = new Map<string, StudioObjectPlacement>();
  private nextObjectPlacementId = 0;
  private selectedObjectPlacementKey: string | null = null;
  private isMovingObject = false;
  private objectMoveOffset: Phaser.Math.Vector2 | null = null;
  private undoStack: StudioMapExport[] = [];
  private pendingUndoSnapshot: StudioMapExport | null = null;
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
    this.game.canvas.tabIndex = -1;
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
    this.clearUndoHistory();
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
    this.clearUndoHistory();
  }

  private applyMap(
    map: StudioMapExport,
    message = "Imported map JSON",
    options: { preserveCamera?: boolean } = {}
  ) {
    const cameraViewport = options.preserveCamera
      ? this.captureCameraViewport()
      : null;

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
      if (
        !this.isFootprintInBounds(
          placement.x,
          placement.y,
          placement.width,
          placement.height
        )
      ) {
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
      this.placeObjectAt(
        object.layer ?? 1,
        object.x,
        object.y,
        object.assetId,
        object.frame,
        object.width ?? 1,
        object.height ?? 1
      );
    }

    this.updateCameraBounds();
    if (cameraViewport) {
      this.restoreCameraViewport(cameraViewport);
    }
    this.drawGrid();
    this.updateStatus(message);
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

    if (layer !== this.selectedLayer) {
      this.setSelectedObjectPlacement(null);
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
    if (mode !== "object") {
      this.setSelectedObjectPlacement(null);
    }
    this.updateStatus();
  }

  setObjectPaintMode(mode: ObjectPaintMode) {
    this.objectPaintMode = mode;
    this.isMovingObject = false;
    this.objectMoveOffset = null;
    this.lastPaintKey = "";
    if (mode !== "select") {
      this.setSelectedObjectPlacement(null);
      if (mode === "place") {
        this.refreshObjectPreview();
        this.refreshObjectPreviewAtActivePointer();
        this.focusCanvasForKeyboardInput();
      }
    } else {
      this.hideObjectPreview();
      this.updateSelectedObjectBorder();
    }
    this.updateStatus();
  }

  setObjectFootprint(width: number, height: number) {
    const footprintWidth = normalizeFootprintSize(width);
    const footprintHeight = normalizeFootprintSize(height);
    const selectedPlacement =
      this.objectPaintMode === "select"
        ? this.getSelectedObjectPlacement()
        : null;

    if (selectedPlacement) {
      if (
        !this.isFootprintInBounds(
          selectedPlacement.x,
          selectedPlacement.y,
          footprintWidth,
          footprintHeight
        )
      ) {
        this.updateStatus("Selected object footprint does not fit here");
        return;
      }

      const undoSnapshot = this.captureUndoSnapshot();
      selectedPlacement.width = footprintWidth;
      selectedPlacement.height = footprintHeight;
      this.objectFootprintWidth = footprintWidth;
      this.objectFootprintHeight = footprintHeight;
      this.refreshObjectPlacementDisplay(selectedPlacement);
      this.objectLayer.sort("depth");
      this.updateSelectedObjectBorder();
      this.commitUndoSnapshot(undoSnapshot);
      this.updateStatus(
        `Resized ${this.getObjectPlacementLabel(
          selectedPlacement
        )} to ${footprintWidth}x${footprintHeight}`
      );
      return;
    }

    this.objectFootprintWidth = footprintWidth;
    this.objectFootprintHeight = footprintHeight;
    this.refreshObjectPreview();
    this.refreshObjectPreviewAtActivePointer();
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
    const undoSnapshot = this.captureUndoSnapshot();
    this.fillSelectedLayer();
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus(
      `Filled layer ${this.selectedLayer} with ${terrainLabel(
        this.selectedTerrain
      )}`
    );
  }

  clearActiveLayer() {
    const undoSnapshot = this.captureUndoSnapshot();
    this.clearSelectedLayer();
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus(`Cleared layer ${this.selectedLayer}`);
  }

  clearObjects() {
    const undoSnapshot = this.captureUndoSnapshot();
    this.clearObjectPlacements();
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus("Cleared placed objects");
  }

  deleteSelectedObject() {
    const key = this.selectedObjectPlacementKey;
    const selectedPlacement = this.getSelectedObjectPlacement();
    if (!key || !selectedPlacement) {
      this.updateStatus("No object selected");
      return;
    }

    const label = this.getObjectPlacementLabel(selectedPlacement);
    const undoSnapshot = this.captureUndoSnapshot();
    this.deleteObjectPlacement(key, selectedPlacement);
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus(`Deleted ${label}`);
  }

  resizeMap(width: number, height: number) {
    if (!isValidWorldSize(width) || !isValidWorldSize(height)) {
      this.updateStatus("Invalid size. Use numbers from 5 to 200.");
      return false;
    }

    const undoSnapshot = this.captureUndoSnapshot();
    this.resizeWorld(width, height);
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus(`Resized to ${width}x${height}`);
    return true;
  }

  getExport(): StudioMapExport {
    return this.exportMap();
  }

  undo() {
    const previousMap = this.undoStack.pop();
    this.pendingUndoSnapshot = null;

    if (!previousMap) {
      this.updateStatus("Nothing to undo");
      return false;
    }

    this.applyMap(previousMap, "Undid last action", { preserveCamera: true });
    return true;
  }

  setBaseTerrain(terrainId: TerrainVisualAssetId) {
    const terrainAsset = this.terrainAssets.find(
      (asset) => asset.id === terrainId
    );
    if (!terrainAsset) {
      this.updateStatus("Choose a generated terrain for layer 0 first.");
      return false;
    }

    if (terrainId === this.baseTerrain) {
      return true;
    }

    const undoSnapshot = this.captureUndoSnapshot();
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
          this.commitUndoSnapshot(undoSnapshot);
          this.updateStatus(`Layer 0 set to ${terrainLabel(terrainId)}`);
        }
      });
      return true;
    }

    this.rebuildLayersForBaseTerrain(terrainId);
    this.commitUndoSnapshot(undoSnapshot);
    this.updateStatus(`Layer 0 set to ${terrainLabel(terrainId)}`);
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
      baseTerrain: this.baseTerrain,
      toolMode: this.toolMode,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      selectedObject: this.selectedObject,
      selectedObjectFrame: this.selectedObjectFrame,
      objectFootprintWidth: this.objectFootprintWidth,
      objectFootprintHeight: this.objectFootprintHeight,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      objectPaintMode: this.objectPaintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: activeLayer?.cells.size ?? 0,
      objectCount: this.objectPlacements.size,
      hasSelectedObjectPlacement: Boolean(
        this.selectedObjectPlacementKey &&
          this.objectPlacements.has(this.selectedObjectPlacementKey)
      ),
      canUndo: this.undoStack.length > 0,
      message: DEFAULT_STUDIO_HELP,
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
    if (!this.input.pointer2) {
      this.input.addPointer(1);
    }

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.focusCanvasForKeyboardInput();

      if (pointer.wasTouch && this.getActiveTouchPointers().length >= 2) {
        this.startTouchGesture();
        return;
      }

      if (pointer.middleButtonDown() || pointer.rightButtonDown()) {
        this.startPan(pointer);
        return;
      }

      if (this.toolMode === "object" && this.objectPaintMode === "select") {
        this.startObjectMove(pointer);
        return;
      }

      this.isPainting = true;
      this.lastPaintKey = "";
      this.beginUndoSnapshot();
      this.applyToolAtPointer(pointer);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch && this.getActiveTouchPointers().length >= 2) {
        this.updateTouchGesture();
        return;
      }

      this.touchGesture = null;

      if (this.isPanning) {
        this.panCamera(pointer);
        return;
      }

      if (this.isMovingObject) {
        this.moveSelectedObjectAtPointer(pointer);
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
      this.isMovingObject = false;
      this.objectMoveOffset = null;
      this.touchGesture = null;
      this.lastPaintKey = "";
      this.commitPendingUndoSnapshot();
      this.updateStatus();
    });

    this.input.on("pointerout", () => {
      this.hideObjectPreview();
    });

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      this.handleObjectPlacementFootprintKeydown(event);
    });

    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _objects: unknown,
        deltaX: number,
        deltaY: number
      ) => {
        const event = pointer.event as WheelEvent | undefined;

        if (event?.ctrlKey || event?.metaKey) {
          const nextZoom = Phaser.Math.Clamp(
            this.cameras.main.zoom *
              Math.pow(2, -deltaY / WHEEL_PINCH_ZOOM_DIVISOR),
            MIN_CAMERA_ZOOM,
            MAX_CAMERA_ZOOM
          );

          this.zoomAtPointer(pointer, nextZoom);
          return;
        }

        this.panCameraByWheel(deltaX, deltaY);
      }
    );
  }

  private handleObjectPlacementFootprintKeydown(event: KeyboardEvent) {
    const delta = OBJECT_FOOTPRINT_KEY_DELTAS[event.key];
    if (!delta || !this.canAdjustObjectPlacementFootprintWithKeyboard(event)) {
      return;
    }

    event.preventDefault();
    this.lastPaintKey = "";
    this.setObjectFootprint(
      this.objectFootprintWidth + delta.width,
      this.objectFootprintHeight + delta.height
    );
  }

  private canAdjustObjectPlacementFootprintWithKeyboard(event: KeyboardEvent) {
    return (
      this.toolMode === "object" &&
      this.objectPaintMode === "place" &&
      this.input.isOver &&
      !isEditableKeyboardTarget(event.target)
    );
  }

  private focusCanvasForKeyboardInput() {
    this.game.canvas.focus({ preventScroll: true });
  }

  private refreshObjectPreviewAtActivePointer() {
    if (!this.input.isOver) {
      return;
    }

    this.updateObjectPreviewAtPointer(this.input.activePointer);
  }

  private zoomAtPointer(pointer: Phaser.Input.Pointer, nextZoom: number) {
    this.zoomAtScreenPoint(pointer.x, pointer.y, nextZoom);
  }

  private zoomAtScreenPoint(
    screenX: number,
    screenY: number,
    nextZoom: number
  ) {
    const camera = this.cameras.main;
    const worldPointBeforeZoom = camera.getWorldPoint(screenX, screenY);

    camera.setZoom(
      Phaser.Math.Clamp(nextZoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
    );
    camera.preRender();

    const worldPointAfterZoom = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += worldPointBeforeZoom.x - worldPointAfterZoom.x;
    camera.scrollY += worldPointBeforeZoom.y - worldPointAfterZoom.y;
  }

  private applyToolAtPointer(pointer: Phaser.Input.Pointer) {
    if (this.toolMode === "object") {
      if (this.objectPaintMode === "select") {
        return;
      }
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

    const stampKey = `${tileX},${tileY},object,${this.selectedLayer},${this.objectPaintMode},${this.selectedObject},${this.selectedObjectFrame}`;
    if (stampKey === this.lastPaintKey) {
      return;
    }
    this.lastPaintKey = stampKey;

    if (this.objectPaintMode === "erase") {
      const radius = Math.floor(this.brushSize / 2);

      for (let y = tileY - radius; y <= tileY + radius; y += 1) {
        for (let x = tileX - radius; x <= tileX + radius; x += 1) {
          if (this.isInBounds(x, y)) {
            this.removeObjectAt(x, y);
          }
        }
      }
      this.updateStatus();
      return;
    }

    this.placeObjectAt(
      this.selectedLayer,
      tileX,
      tileY,
      this.selectedObject,
      this.selectedObjectFrame,
      this.objectFootprintWidth,
      this.objectFootprintHeight
    );
    this.updateStatus();
  }

  private startObjectMove(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    if (!this.isInBounds(tileX, tileY)) {
      this.setSelectedObjectPlacement(null);
      this.updateStatus("No object selected");
      return;
    }

    const placement = this.findObjectPlacementAt(tileX, tileY);
    if (!placement) {
      this.setSelectedObjectPlacement(null);
      this.updateStatus("No object selected");
      return;
    }

    const [key, object] = placement;
    const asset = this.objectAssets.find(
      (candidate) => candidate.id === object.assetId
    );

    this.selectedLayer = object.layer;
    this.selectedObject = object.assetId;
    this.selectedObjectFrame = object.frame;
    this.objectFootprintWidth = object.width;
    this.objectFootprintHeight = object.height;
    this.objectMoveOffset = new Phaser.Math.Vector2(
      tileX - object.x,
      tileY - object.y
    );
    this.isMovingObject = true;
    this.lastPaintKey = "";
    this.setSelectedObjectPlacement(key);
    this.beginUndoSnapshot();
    this.updateStatus(
      `Selected ${asset?.label ?? objectLabel(object.assetId)} on layer ${
        object.layer
      }`
    );
  }

  private moveSelectedObjectAtPointer(pointer: Phaser.Input.Pointer) {
    const key = this.selectedObjectPlacementKey;
    const object = this.getSelectedObjectPlacement();
    if (!key || !object || !this.objectMoveOffset) {
      return;
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);
    const nextX = tileX - this.objectMoveOffset.x;
    const nextY = tileY - this.objectMoveOffset.y;

    if (!this.isFootprintInBounds(nextX, nextY, object.width, object.height)) {
      return;
    }

    const moveKey = `${key},${nextX},${nextY}`;
    if (moveKey === this.lastPaintKey) {
      return;
    }
    this.lastPaintKey = moveKey;

    object.x = nextX;
    object.y = nextY;
    this.positionObjectPlacement(object);
    this.objectLayer.sort("depth");
    this.updateSelectedObjectBorder();
    this.updateStatus(
      `Moved ${this.getObjectPlacementLabel(object)} to ${nextX},${nextY}`
    );
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
    this.isPainting = false;
    this.isMovingObject = false;
    this.objectMoveOffset = null;
    this.touchGesture = null;
    this.panStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
    this.cameraStart = new Phaser.Math.Vector2(
      this.cameras.main.scrollX,
      this.cameras.main.scrollY
    );
  }

  private updateObjectPreviewAtPointer(pointer: Phaser.Input.Pointer) {
    if (this.toolMode !== "object" || this.objectPaintMode === "select") {
      this.hideObjectPreview();
      return;
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    const previewWidth =
      this.objectPaintMode === "erase"
        ? this.brushSize
        : this.objectFootprintWidth;
    const previewHeight =
      this.objectPaintMode === "erase"
        ? this.brushSize
        : this.objectFootprintHeight;

    if (!this.isFootprintInBounds(tileX, tileY, previewWidth, previewHeight)) {
      this.hideObjectPreview();
      return;
    }

    const border = this.ensureObjectPreviewBorder();
    border
      .setPosition(
        tileX * TILE_SIZE + (previewWidth * TILE_SIZE) / 2,
        tileY * TILE_SIZE + (previewHeight * TILE_SIZE) / 2
      )
      .setSize(previewWidth * TILE_SIZE, previewHeight * TILE_SIZE)
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
      frameSize,
      this.objectFootprintWidth,
      this.objectFootprintHeight
    );
    image
      .setPosition(
        tileX * TILE_SIZE + (this.objectFootprintWidth * TILE_SIZE) / 2,
        tileY * TILE_SIZE + (this.objectFootprintHeight * TILE_SIZE) / 2
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

  private updateSelectedObjectBorder() {
    const object = this.getSelectedObjectPlacement();
    if (
      !object ||
      this.toolMode !== "object" ||
      this.objectPaintMode !== "select"
    ) {
      this.selectedObjectBorder?.setVisible(false);
      return;
    }

    const border = this.ensureSelectedObjectBorder();
    border
      .setPosition(
        object.x * TILE_SIZE + (object.width * TILE_SIZE) / 2,
        object.y * TILE_SIZE + (object.height * TILE_SIZE) / 2
      )
      .setSize(object.width * TILE_SIZE, object.height * TILE_SIZE)
      .setVisible(true);
  }

  private ensureSelectedObjectBorder() {
    if (!this.selectedObjectBorder) {
      this.selectedObjectBorder = this.add
        .rectangle(0, 0, TILE_SIZE, TILE_SIZE)
        .setStrokeStyle(2, 0xf59e0b, 0.98)
        .setFillStyle(0xfbbf24, 0.1)
        .setVisible(false);
      this.objectPreviewLayer.add(this.selectedObjectBorder);
    }

    return this.selectedObjectBorder;
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

  private panCameraByWheel(deltaX: number, deltaY: number) {
    const camera = this.cameras.main;
    camera.scrollX += deltaX / camera.zoom;
    camera.scrollY += deltaY / camera.zoom;
  }

  private startTouchGesture() {
    const metrics = this.getTouchGestureMetrics();
    if (!metrics) {
      return;
    }

    this.isPainting = false;
    this.isPanning = false;
    this.isMovingObject = false;
    this.objectMoveOffset = null;
    this.lastPaintKey = "";
    this.hideObjectPreview();
    this.touchGesture = metrics;
  }

  private updateTouchGesture() {
    const metrics = this.getTouchGestureMetrics();
    if (!metrics) {
      this.touchGesture = null;
      return;
    }

    if (!this.touchGesture) {
      this.startTouchGesture();
      return;
    }

    const camera = this.cameras.main;
    camera.scrollX -=
      (metrics.center.x - this.touchGesture.center.x) / camera.zoom;
    camera.scrollY -=
      (metrics.center.y - this.touchGesture.center.y) / camera.zoom;

    if (this.touchGesture.distance > 0 && metrics.distance > 0) {
      this.zoomAtScreenPoint(
        metrics.center.x,
        metrics.center.y,
        camera.zoom * (metrics.distance / this.touchGesture.distance)
      );
    }

    this.touchGesture = metrics;
  }

  private getTouchGestureMetrics(): TouchGestureState | null {
    const pointers = this.getActiveTouchPointers();
    if (pointers.length < 2) {
      return null;
    }

    const pointerA = pointers[0];
    const pointerB = pointers[1];
    return {
      center: new Phaser.Math.Vector2(
        (pointerA.x + pointerB.x) / 2,
        (pointerA.y + pointerB.y) / 2
      ),
      distance: Phaser.Math.Distance.Between(
        pointerA.x,
        pointerA.y,
        pointerB.x,
        pointerB.y
      ),
    };
  }

  private getActiveTouchPointers() {
    return this.input.manager.pointers.filter(
      (pointer) => pointer.wasTouch && pointer.isDown
    );
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

  private placeObjectAt(
    layer: number,
    x: number,
    y: number,
    assetId: string,
    frame?: number,
    width = 1,
    height = 1
  ) {
    const placementLayer = isValidLayer(layer) ? layer : 1;
    const footprintWidth = normalizeFootprintSize(width);
    const footprintHeight = normalizeFootprintSize(height);
    if (!this.isFootprintInBounds(x, y, footprintWidth, footprintHeight)) {
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

    const selectedFrame = frame ?? getDefaultObjectFrame(asset);
    const key = this.createObjectPlacementKey();
    const image = this.add
      .image(
        x * TILE_SIZE + (footprintWidth * TILE_SIZE) / 2,
        y * TILE_SIZE + (footprintHeight * TILE_SIZE) / 2,
        studioObjectSpriteKey(asset.id)
      )
      .setOrigin(0.5, 0.5)
      .setDepth(getObjectRenderDepth(placementLayer, y, footprintHeight));
    const frameSize = this.applyObjectFrameTexture(image, asset, selectedFrame);
    const displaySize = getObjectFrameDisplaySize(
      asset,
      selectedFrame,
      frameSize,
      footprintWidth,
      footprintHeight
    );
    image.setDisplaySize(displaySize.width, displaySize.height);

    this.objectLayer.add(image);
    this.objectPlacements.set(key, {
      category: asset.category,
      assetId: asset.id,
      layer: placementLayer,
      x,
      y,
      frame: selectedFrame,
      width: footprintWidth,
      height: footprintHeight,
      image,
    });
    this.objectLayer.sort("depth");
  }

  private positionObjectPlacement(object: StudioObjectPlacement) {
    object.image
      .setPosition(
        object.x * TILE_SIZE + (object.width * TILE_SIZE) / 2,
        object.y * TILE_SIZE + (object.height * TILE_SIZE) / 2
      )
      .setDepth(getObjectRenderDepth(object.layer, object.y, object.height));
  }

  private refreshObjectPlacementDisplay(object: StudioObjectPlacement) {
    const asset = this.objectAssets.find(
      (candidate) => candidate.id === object.assetId
    );
    if (
      !asset ||
      !this.textures ||
      !this.textures.exists(studioObjectSpriteKey(asset.id))
    ) {
      this.positionObjectPlacement(object);
      return;
    }

    const frameSize = this.applyObjectFrameTexture(
      object.image,
      asset,
      object.frame
    );
    const displaySize = getObjectFrameDisplaySize(
      asset,
      object.frame,
      frameSize,
      object.width,
      object.height
    );
    object.image
      .setOrigin(0.5, 0.5)
      .setDisplaySize(displaySize.width, displaySize.height);
    this.positionObjectPlacement(object);
  }

  private removeObjectAt(x: number, y: number) {
    const placement = this.findObjectPlacementAt(x, y, this.selectedLayer);

    if (placement) {
      const [key, object] = placement;
      this.deleteObjectPlacement(key, object);
    }
  }

  private findObjectPlacementAt(x: number, y: number, layer?: number) {
    return [...this.objectPlacements]
      .filter(
        ([, candidate]) =>
          (layer === undefined || candidate.layer === layer) &&
          pointIntersectsPlacement(x, y, candidate)
      )
      .sort(
        ([, a], [, b]) =>
          b.image.depth - a.image.depth ||
          this.objectLayer.getIndex(b.image) -
            this.objectLayer.getIndex(a.image)
      )[0];
  }

  private getSelectedObjectPlacement() {
    if (!this.selectedObjectPlacementKey) {
      return null;
    }

    const object = this.objectPlacements.get(this.selectedObjectPlacementKey);
    if (!object) {
      this.setSelectedObjectPlacement(null);
      return null;
    }

    return object;
  }

  private setSelectedObjectPlacement(key: string | null) {
    this.selectedObjectPlacementKey = key;
    if (!key) {
      this.isMovingObject = false;
      this.objectMoveOffset = null;
    }
    this.updateSelectedObjectBorder();
  }

  private deleteObjectPlacement(key: string, object: StudioObjectPlacement) {
    object.image.destroy();
    this.objectPlacements.delete(key);
    if (this.selectedObjectPlacementKey === key) {
      this.setSelectedObjectPlacement(null);
    }
  }

  private getObjectPlacementLabel(object: StudioObjectPlacement) {
    return (
      this.objectAssets.find((asset) => asset.id === object.assetId)?.label ??
      objectLabel(object.assetId)
    );
  }

  private createObjectPlacementKey() {
    this.nextObjectPlacementId += 1;
    return `object:${this.nextObjectPlacementId}`;
  }

  private clearObjectPlacements() {
    for (const placement of this.objectPlacements.values()) {
      placement.image.destroy();
    }

    this.objectPlacements.clear();
    this.nextObjectPlacementId = 0;
    this.setSelectedObjectPlacement(null);
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
    for (const [key, placement] of [...this.objectPlacements]) {
      if (
        !this.isFootprintInBounds(
          placement.x,
          placement.y,
          placement.width,
          placement.height
        )
      ) {
        this.deleteObjectPlacement(key, placement);
      }
    }
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

  private captureCameraViewport(): CameraViewportState {
    const camera = this.cameras.main;

    return {
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      zoom: camera.zoom,
    };
  }

  private restoreCameraViewport(viewport: CameraViewportState) {
    const camera = this.cameras.main;
    camera.setZoom(
      Phaser.Math.Clamp(viewport.zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
    );
    camera.setScroll(viewport.scrollX, viewport.scrollY);
    camera.preRender();
  }

  private updateStatus(message?: string) {
    const activeLayer = this.getLayer(this.selectedLayer, this.selectedTerrain);
    const cellCount = activeLayer?.cells.size ?? 0;
    this.options.onStateChange?.({
      width: this.widthTiles,
      height: this.heightTiles,
      baseTerrain: this.baseTerrain,
      toolMode: this.toolMode,
      selectedLayer: this.selectedLayer,
      selectedTerrain: this.selectedTerrain,
      selectedObject: this.selectedObject,
      selectedObjectFrame: this.selectedObjectFrame,
      objectFootprintWidth: this.objectFootprintWidth,
      objectFootprintHeight: this.objectFootprintHeight,
      brushSize: this.brushSize,
      paintMode: this.paintMode,
      objectPaintMode: this.objectPaintMode,
      showGrid: this.showGrid,
      activeLayerCellCount: cellCount,
      objectCount: this.objectPlacements.size,
      hasSelectedObjectPlacement: Boolean(
        this.selectedObjectPlacementKey &&
          this.objectPlacements.has(this.selectedObjectPlacementKey)
      ),
      canUndo: this.undoStack.length > 0,
      message: message ?? DEFAULT_STUDIO_HELP,
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
          layer: object.layer,
          x: object.x,
          y: object.y,
          frame: object.frame,
          width: object.width,
          height: object.height,
        }))
        .sort(
          (a, b) =>
            a.layer - b.layer ||
            a.y - b.y ||
            a.x - b.x ||
            a.assetId.localeCompare(b.assetId)
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

  private captureUndoSnapshot() {
    return this.exportMap();
  }

  private beginUndoSnapshot() {
    if (!this.pendingUndoSnapshot) {
      this.pendingUndoSnapshot = this.captureUndoSnapshot();
    }
  }

  private commitPendingUndoSnapshot() {
    const snapshot = this.pendingUndoSnapshot;
    this.pendingUndoSnapshot = null;
    this.commitUndoSnapshot(snapshot);
  }

  private commitUndoSnapshot(snapshot: StudioMapExport | null) {
    if (!snapshot || areStudioMapExportsEqual(snapshot, this.exportMap())) {
      return false;
    }

    const lastSnapshot = this.undoStack[this.undoStack.length - 1];
    if (!lastSnapshot || !areStudioMapExportsEqual(lastSnapshot, snapshot)) {
      this.undoStack.push(snapshot);
    }

    if (this.undoStack.length > MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }

    return true;
  }

  private clearUndoHistory() {
    this.undoStack = [];
    this.pendingUndoSnapshot = null;
    this.updateStatus();
  }

  private isInBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.widthTiles && y < this.heightTiles;
  }

  private isFootprintInBounds(
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    return (
      x >= 0 &&
      y >= 0 &&
      width >= 1 &&
      height >= 1 &&
      x + width <= this.widthTiles &&
      y + height <= this.heightTiles
    );
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
        frameSize,
        placement.width,
        placement.height
      );
      placement.image
        .setPosition(
          placement.x * TILE_SIZE + (placement.width * TILE_SIZE) / 2,
          placement.y * TILE_SIZE + (placement.height * TILE_SIZE) / 2
        )
        .setOrigin(0.5, 0.5)
        .setDepth(
          getObjectRenderDepth(placement.layer, placement.y, placement.height)
        )
        .setDisplaySize(displaySize.width, displaySize.height);
    }
    this.objectLayer.sort("depth");
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
      !["plants", "buildings", "objects"].includes(asset.category) ||
      !["plant", "tree", "building", "object"].includes(asset.kind) ||
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
    if (!object) {
      throw new Error("Map includes an invalid object placement.");
    }

    const width = object.width ?? 1;
    const height = object.height ?? 1;
    const layer = object.layer ?? 1;
    if (
      !["plants", "buildings", "objects"].includes(object.category) ||
      typeof object.assetId !== "string" ||
      !isValidLayer(layer) ||
      !Number.isInteger(object.x) ||
      !Number.isInteger(object.y) ||
      !Number.isInteger(object.frame) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 6 ||
      height > 6 ||
      object.x < 0 ||
      object.y < 0 ||
      object.x + width > map.width ||
      object.y + height > map.height
    ) {
      throw new Error("Map includes an invalid object placement.");
    }
  }
}

function areStudioMapExportsEqual(
  left: StudioMapExport,
  right: StudioMapExport
) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function normalizeFootprintSize(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Phaser.Math.Clamp(Math.floor(value), 1, 6);
}

function getObjectRenderDepth(layer: number, y: number, height: number) {
  return (y + height - 1) * (STUDIO_LAYER_COUNT + 1) + layer;
}

function pointIntersectsPlacement(
  x: number,
  y: number,
  placement: Pick<StudioObjectPlacement, "x" | "y" | "width" | "height">
) {
  return (
    x >= placement.x &&
    y >= placement.y &&
    x < placement.x + placement.width &&
    y < placement.y + placement.height
  );
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
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
  if (asset.category !== "plants") {
    return 0;
  }

  const grownRow = Math.min(2, asset.rows - 1);
  return grownRow * asset.columns;
}

function getObjectFrameDisplaySize(
  asset: StudioObjectSpriteAsset,
  frame: number,
  frameSize: {
    width: number;
    height: number;
  },
  footprintWidth = 1,
  footprintHeight = 1
) {
  const targetWidth = TILE_SIZE * Math.max(1, footprintWidth);
  const targetHeight = TILE_SIZE * Math.max(1, footprintHeight);
  const scale = Math.min(
    targetWidth / frameSize.width,
    targetHeight / frameSize.height
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
