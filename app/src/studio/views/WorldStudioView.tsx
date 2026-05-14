import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  BroomIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  EraserIcon,
  FloppyDiskIcon,
  GridFourIcon,
  PaintBrushIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ResizeIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import Phaser from "phaser";
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  TERRAIN_VISUAL_ASSETS,
  TerrainVisualAsset,
  TerrainVisualAssetId,
} from "../../assets/visual-assets";
import { SegmentedControl } from "../components/SegmentedControl";
import { saveStudioMapToConvex } from "../convex/convex-studio";
import { DEFAULT_STUDIO_HELP, LAYERED_STUDIO_HELP } from "../lib/studio-data";
import type {
  StudioMapRecord,
  StudioObjectSpriteRecord,
  StudioPlantSpriteRecord,
} from "../lib/studio-types";
import { downloadStudioMap } from "../phaser/download-studio-map";
import {
  STUDIO_HEIGHT,
  STUDIO_LAYER_OPTIONS,
  STUDIO_WIDTH,
  StudioScene,
  terrainLabel,
  validateStudioMap,
  type StudioMapExport,
  type StudioObjectSpriteAsset,
  type StudioSceneState,
} from "../phaser/studio-scene";

type OpenWorld =
  | {
      kind: "new";
      id: null;
      map: null;
      name: string;
    }
  | {
      kind: "saved";
      id: string;
      map: StudioMapExport;
      name: string;
    };

type WorldStudioSettings = {
  autoSave: boolean;
  brushSize: number;
  objectPaintMode: "place" | "erase" | "select";
  objectFootprintHeight: number;
  objectFootprintWidth: number;
  paintMode: "paint" | "erase";
  selectedLayer: number;
  selectedObject: string;
  selectedObjectFrame: number;
  selectedTerrain: string;
  showGrid: boolean;
  toolMode: "terrain" | "object";
};

const WORLD_STUDIO_SETTINGS_KEY = "open-wilds:world-studio:settings";
const AUTOSAVE_DELAY_MS = 1200;
const MIN_OBJECT_FOOTPRINT = 1;
const MAX_OBJECT_FOOTPRINT = 6;
const WORLD_THUMBNAIL_WIDTH = 220;
const WORLD_THUMBNAIL_HEIGHT = 132;
const WORLD_THUMBNAIL_PADDING = 5;
const TERRAIN_CENTER_VARIANT_COLUMNS = 4;
const TERRAIN_CENTER_VARIANT_ROWS = 4;

type StudioMapObjectPlacement = NonNullable<StudioMapExport["objects"]>[number];

export function WorldStudioView({
  generatedTerrains,
  objectSprites,
  plantSprites,
  readOnly,
  savedWorlds,
  workspaceId,
}: {
  generatedTerrains: TerrainVisualAsset[];
  objectSprites: StudioObjectSpriteRecord[];
  plantSprites: StudioPlantSpriteRecord[];
  readOnly: boolean;
  savedWorlds: StudioMapRecord[];
  workspaceId: string;
}) {
  const sceneRef = useRef<StudioScene | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const objectPaletteRef = useRef<HTMLDivElement | null>(null);
  const gameHostIdRef = useRef(
    `world-studio-game-${Math.random().toString(36).slice(2)}`
  );
  const loadedWorldIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const autosaveTimerRef = useRef<number | null>(null);
  const settingsAppliedWorldRef = useRef<string | null>(null);
  const skipNextBaseSyncRef = useRef(false);
  const [openWorld, setOpenWorld] = useState<OpenWorld | null>(null);
  const [state, setState] = useState<StudioSceneState | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [isWorldLoading, setIsWorldLoading] = useState(false);
  const [storedSettings, setStoredSettings] = useState(readWorldStudioSettings);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(
    storedSettings.autoSave
  );
  const [newWorldName, setNewWorldName] = useState("Untitled World");
  const [worldName, setWorldName] = useState("Untitled World");
  const [mapSize, setMapSize] = useState({ width: 40, height: 40 });
  const [baseTerrainId, setBaseTerrainId] = useState<TerrainVisualAssetId>("");
  const [mapStatus, setMapStatus] = useState<string | null>(null);
  const [objectCategoryFilter, setObjectCategoryFilter] =
    useState<StudioObjectSpriteAsset["category"]>("plants");
  const editorTerrainAssets = useMemo(
    () =>
      mergeTerrainAssets([
        ...(openWorld?.map?.terrainAssets ?? []),
        ...generatedTerrains,
      ]),
    [generatedTerrains, openWorld]
  );
  const editorObjectAssets = useMemo(
    () =>
      mergeObjectAssets([
        ...(openWorld?.map?.objectAssets ?? []),
        ...plantSpritesToObjectAssets(plantSprites),
        ...objectSpritesToObjectAssets(objectSprites),
      ]),
    [objectSprites, openWorld, plantSprites]
  );
  const thumbnailTerrainAssets = useMemo(
    () =>
      mergeTerrainAssets([
        ...Object.values(TERRAIN_VISUAL_ASSETS),
        ...generatedTerrains,
      ]),
    [generatedTerrains]
  );
  const thumbnailObjectAssets = useMemo(
    () =>
      mergeObjectAssets([
        ...plantSpritesToObjectAssets(plantSprites),
        ...objectSpritesToObjectAssets(objectSprites),
      ]),
    [objectSprites, plantSprites]
  );

  const paintableTerrains = useMemo(
    () => editorTerrainAssets.filter((asset) => asset.id !== baseTerrainId),
    [baseTerrainId, editorTerrainAssets]
  );

  useEffect(() => {
    if (!openWorld) {
      return;
    }

    if (!editorTerrainAssets.length) {
      setBaseTerrainId("");
      return;
    }

    const hasCurrentBase = editorTerrainAssets.some(
      (asset) => asset.id === baseTerrainId
    );
    if (!hasCurrentBase) {
      setBaseTerrainId(openWorld.map?.baseTerrain ?? editorTerrainAssets[0].id);
    }
  }, [baseTerrainId, editorTerrainAssets, openWorld]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!openWorld || !baseTerrainId || gameRef.current) {
      return;
    }

    const scene = new StudioScene({
      baseTerrain: baseTerrainId,
      height: mapSize.height,
      objectAssets: editorObjectAssets,
      terrainAssets: editorTerrainAssets,
      width: mapSize.width,
      onStateChange: setState,
      onReady: () => setSceneReady(true),
    });
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameHostIdRef.current,
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      backgroundColor: "#17211e",
      scene,
      input: {
        activePointers: 2,
        mouse: {
          preventDefaultWheel: true,
        },
        touch: {
          capture: true,
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
      },
    });

    sceneRef.current = scene;
    gameRef.current = game;
  }, [
    baseTerrainId,
    editorObjectAssets,
    editorTerrainAssets,
    mapSize.height,
    mapSize.width,
    openWorld,
  ]);

  useEffect(() => {
    for (const asset of editorTerrainAssets) {
      sceneRef.current?.addTerrainAsset(asset, false);
    }
  }, [editorTerrainAssets]);

  useEffect(() => {
    for (const asset of editorObjectAssets) {
      sceneRef.current?.addObjectAsset(asset, false);
    }
  }, [editorObjectAssets]);

  useEffect(() => {
    if (openWorld?.kind === "new" && sceneReady) {
      setIsWorldLoading(false);
    }
  }, [openWorld, sceneReady]);

  useEffect(() => {
    if (baseTerrainId) {
      if (skipNextBaseSyncRef.current) {
        skipNextBaseSyncRef.current = false;
        return;
      }

      sceneRef.current?.setBaseTerrain(baseTerrainId);
    }
  }, [baseTerrainId]);

  useEffect(() => {
    const scene = sceneRef.current;
    const worldMap = openWorld?.map;
    if (
      !openWorld ||
      !worldMap ||
      !scene ||
      !sceneReady ||
      loadedWorldIdRef.current === openWorld.id
    ) {
      return;
    }

    setIsWorldLoading(true);
    void scene
      .loadMap(worldMap)
      .then(() => {
        loadedWorldIdRef.current = openWorld.id;
        lastSavedSnapshotRef.current = createWorldSnapshot(
          openWorld.name,
          worldMap,
          autoSaveEnabled
        );
        skipNextBaseSyncRef.current = true;
        setBaseTerrainId(worldMap.baseTerrain);
        setWorldName(openWorld.name);
        setMapSize({ width: worldMap.width, height: worldMap.height });
        setMapStatus(`Loaded ${openWorld.name} from Convex.`);
      })
      .catch((error) => {
        setMapStatus(
          error instanceof Error ? error.message : "Could not load saved world."
        );
      })
      .finally(() => setIsWorldLoading(false));
  }, [autoSaveEnabled, openWorld, sceneReady]);

  const selectedLayer = state?.selectedLayer ?? STUDIO_LAYER_OPTIONS[0];
  const selectedTerrain =
    state?.selectedTerrain ?? paintableTerrains[0]?.id ?? baseTerrainId;
  const selectedObjectId =
    state?.selectedObject ?? editorObjectAssets[0]?.id ?? "";
  const selectedObjectFrame = state?.selectedObjectFrame ?? 0;
  const selectedObject = editorObjectAssets.find(
    (asset) => asset.id === selectedObjectId
  );
  const filteredObjectAssets = editorObjectAssets.filter(
    (asset) => asset.category === objectCategoryFilter
  );
  const toolMode = state?.toolMode ?? "terrain";
  const paintMode = state?.paintMode ?? "paint";
  const objectPaintMode = state?.objectPaintMode ?? "place";
  const objectFootprintWidth = state?.objectFootprintWidth ?? 1;
  const objectFootprintHeight = state?.objectFootprintHeight ?? 1;
  const hasSelectedObjectPlacement = state?.hasSelectedObjectPlacement ?? false;
  const canUndo = state?.canUndo ?? false;
  const brushSize = state?.brushSize ?? 1;
  const showGrid = state?.showGrid ?? true;
  const helpMessage =
    mapStatus ??
    (state?.message === DEFAULT_STUDIO_HELP || !state?.message
      ? LAYERED_STUDIO_HELP
      : state.message);
  const worldSizeLabel = state
    ? `${state.width}x${state.height} world`
    : `${mapSize.width}x${mapSize.height} world`;
  const toolSummary =
    toolMode === "object"
      ? `Layer ${selectedLayer} · Objects · ${
          selectedObject?.label ?? "None"
        } · ${objectFootprintWidth}x${objectFootprintHeight} · ${objectPaintMode} · ${
          state?.objectCount ?? 0
        } placed`
      : `Layer ${selectedLayer} · ${terrainLabel(
          selectedTerrain
        )} · ${paintMode} · ${brushSize}x${brushSize} · ${
          state?.activeLayerCellCount ?? 0
        } cells`;

  useEffect(() => {
    if (state) {
      setMapSize({ width: state.width, height: state.height });
    }
  }, [state?.width, state?.height]);

  useEffect(() => {
    if (!state?.baseTerrain || state.baseTerrain === baseTerrainId) {
      return;
    }

    skipNextBaseSyncRef.current = true;
    setBaseTerrainId(state.baseTerrain);
  }, [baseTerrainId, state?.baseTerrain]);

  useEffect(() => {
    if (selectedObject) {
      setObjectCategoryFilter(selectedObject.category);
    }
  }, [selectedObject?.category]);

  useEffect(() => {
    const palette = objectPaletteRef.current;
    if (!palette || !selectedObjectId) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const selectedOption = Array.from(
        palette.querySelectorAll<HTMLButtonElement>(
          "[data-object-palette-option]"
        )
      ).find(
        (option) =>
          option.dataset.objectId === selectedObjectId &&
          option.dataset.objectFrame === String(selectedObjectFrame)
      );

      selectedOption?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [objectCategoryFilter, selectedObjectFrame, selectedObjectId]);

  useEffect(() => {
    const worldKey = openWorld?.id ?? openWorld?.name;
    if (!state || !worldKey || settingsAppliedWorldRef.current !== worldKey) {
      return;
    }

    const nextSettings: WorldStudioSettings = {
      autoSave: autoSaveEnabled,
      brushSize: state.brushSize,
      objectPaintMode: state.objectPaintMode,
      objectFootprintHeight: state.objectFootprintHeight,
      objectFootprintWidth: state.objectFootprintWidth,
      paintMode: state.paintMode,
      selectedLayer: state.selectedLayer,
      selectedObject: state.selectedObject,
      selectedObjectFrame: state.selectedObjectFrame,
      selectedTerrain: state.selectedTerrain,
      showGrid: state.showGrid,
      toolMode: state.toolMode,
    };
    setStoredSettings(nextSettings);
    writeWorldStudioSettings(nextSettings);
  }, [
    autoSaveEnabled,
    state?.brushSize,
    state?.objectPaintMode,
    state?.objectFootprintHeight,
    state?.objectFootprintWidth,
    state?.paintMode,
    state?.selectedLayer,
    state?.selectedObject,
    state?.selectedObjectFrame,
    state?.selectedTerrain,
    state?.showGrid,
    state?.toolMode,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!openWorld || !scene || !sceneReady || isWorldLoading) {
      return;
    }

    const worldKey = openWorld.id ?? openWorld.name;
    if (settingsAppliedWorldRef.current === worldKey) {
      return;
    }

    scene.setGridVisible(storedSettings.showGrid);
    scene.setBrushSize(storedSettings.brushSize);
    scene.setToolMode(storedSettings.toolMode);
    scene.setPaintMode(storedSettings.paintMode);
    scene.setObjectPaintMode(storedSettings.objectPaintMode);
    scene.setObjectFootprint(
      storedSettings.objectFootprintWidth,
      storedSettings.objectFootprintHeight
    );
    scene.setSelectedLayer(storedSettings.selectedLayer);
    if (
      storedSettings.selectedTerrain &&
      paintableTerrains.some(
        (asset) => asset.id === storedSettings.selectedTerrain
      )
    ) {
      scene.setSelectedTerrain(storedSettings.selectedTerrain);
    }
    if (
      storedSettings.selectedObject &&
      editorObjectAssets.some(
        (asset) => asset.id === storedSettings.selectedObject
      )
    ) {
      scene.setSelectedObject(storedSettings.selectedObject);
      scene.setSelectedObjectVariant(
        storedSettings.selectedObject,
        storedSettings.selectedObjectFrame
      );
    }
    settingsAppliedWorldRef.current = worldKey;
  }, [
    editorObjectAssets,
    isWorldLoading,
    openWorld,
    paintableTerrains,
    sceneReady,
    storedSettings,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (
      readOnly ||
      !autoSaveEnabled ||
      !openWorld ||
      !scene ||
      !sceneReady ||
      isWorldLoading ||
      !state ||
      settingsAppliedWorldRef.current !== (openWorld.id ?? openWorld.name)
    ) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveCurrentWorld("autosave");
    }, AUTOSAVE_DELAY_MS);
  }, [
    autoSaveEnabled,
    isWorldLoading,
    openWorld,
    sceneReady,
    state?.activeLayerCellCount,
    state?.brushSize,
    state?.message,
    state?.objectCount,
    state?.objectPaintMode,
    state?.objectFootprintHeight,
    state?.objectFootprintWidth,
    state?.paintMode,
    state?.selectedLayer,
    state?.selectedObject,
    state?.selectedObjectFrame,
    state?.selectedTerrain,
    state?.showGrid,
    state?.toolMode,
    state?.width,
    state?.height,
    worldName,
    readOnly,
    workspaceId,
  ]);

  const handleImport = async (file: File | undefined) => {
    if (readOnly) {
      setMapStatus("You need editor access to import worlds.");
      return;
    }

    if (!file || !sceneRef.current) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      validateStudioMap(parsed);
      for (const asset of parsed.terrainAssets ?? []) {
        sceneRef.current.addTerrainAsset(asset, false);
      }
      setBaseTerrainId(parsed.baseTerrain);
      setIsWorldLoading(true);
      await sceneRef.current.loadMap(parsed);
      lastSavedSnapshotRef.current = createWorldSnapshot(
        worldName.trim() || "Untitled World",
        parsed,
        autoSaveEnabled
      );
      setMapStatus("Imported world JSON.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsWorldLoading(false);
    }
  };

  const saveCurrentWorld = async (mode: "manual" | "autosave") => {
    const scene = sceneRef.current;

    if (!scene) {
      return null;
    }

    const map = scene.getExport();
    const nextName = worldName.trim() || "Untitled World";
    const snapshot = createWorldSnapshot(nextName, map, autoSaveEnabled);

    if (mode === "autosave" && snapshot === lastSavedSnapshotRef.current) {
      return openWorld?.id ?? loadedWorldIdRef.current;
    }

    if (readOnly || !workspaceId) {
      setMapStatus("You need editor access to save worlds in this workspace.");
      return openWorld?.id ?? loadedWorldIdRef.current;
    }

    const savedWorldId = await saveStudioMapToConvex(
      workspaceId,
      nextName,
      map,
      openWorld?.id ?? loadedWorldIdRef.current
    );
    loadedWorldIdRef.current = savedWorldId;
    lastSavedSnapshotRef.current = snapshot;
    setOpenWorld({
      kind: "saved",
      id: savedWorldId,
      map,
      name: nextName,
    });
    setMapStatus(
      mode === "autosave" ? "Autosaved world." : "Saved world to Convex."
    );

    return savedWorldId;
  };

  const createWorld = () => {
    if (readOnly || !workspaceId) {
      setMapStatus("You need editor access to create worlds.");
      return;
    }

    if (!editorTerrainAssets.length) {
      setMapStatus("Generate a terrain before creating a new world.");
      return;
    }

    loadedWorldIdRef.current = null;
    lastSavedSnapshotRef.current = "";
    settingsAppliedWorldRef.current = null;
    setState(null);
    setSceneReady(false);
    setIsWorldLoading(true);
    setWorldName(newWorldName.trim() || "Untitled World");
    setMapSize({ width: 40, height: 40 });
    setBaseTerrainId(editorTerrainAssets[0].id);
    setMapStatus(null);
    setOpenWorld({
      kind: "new",
      id: null,
      map: null,
      name: newWorldName.trim() || "Untitled World",
    });
  };

  const openSavedWorld = (world: StudioMapRecord) => {
    try {
      const parsed = JSON.parse(world.mapJson) as unknown;
      validateStudioMap(parsed);
      loadedWorldIdRef.current = null;
      lastSavedSnapshotRef.current = createWorldSnapshot(
        world.name,
        parsed,
        autoSaveEnabled
      );
      settingsAppliedWorldRef.current = null;
      setState(null);
      setSceneReady(false);
      setIsWorldLoading(true);
      setWorldName(world.name);
      setMapSize({ width: parsed.width, height: parsed.height });
      setBaseTerrainId(parsed.baseTerrain);
      setMapStatus(null);
      setOpenWorld({
        kind: "saved",
        id: world._id,
        map: parsed,
        name: world.name,
      });
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Could not open saved world."
      );
    }
  };

  const closeWorld = () => {
    loadedWorldIdRef.current = null;
    lastSavedSnapshotRef.current = "";
    settingsAppliedWorldRef.current = null;
    skipNextBaseSyncRef.current = false;
    setOpenWorld(null);
    setState(null);
    setSceneReady(false);
    setIsWorldLoading(false);
    setMapStatus(null);
    sceneRef.current = null;
    gameRef.current?.destroy(true);
    gameRef.current = null;
  };

  const saveWorld = async () => {
    try {
      await saveCurrentWorld("manual");
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Could not save world."
      );
    }
  };

  const renderObjectFootprintStepper = (disabled = false) => (
    <div className="studio-footprint-stepper">
      <span className="studio-footprint-stepper__title">Footprint</span>
      <span className="studio-footprint-stepper__axis">W:</span>
      <div className="studio-footprint-stepper__control">
        <button
          aria-label="Decrease footprint width"
          disabled={disabled || objectFootprintWidth <= MIN_OBJECT_FOOTPRINT}
          onClick={() =>
            sceneRef.current?.setObjectFootprint(
              objectFootprintWidth - 1,
              objectFootprintHeight
            )
          }
          type="button"
        >
          <MinusCircleIcon aria-hidden="true" size={31} weight="fill" />
        </button>
        <strong>{objectFootprintWidth}</strong>
        <button
          aria-label="Increase footprint width"
          disabled={disabled || objectFootprintWidth >= MAX_OBJECT_FOOTPRINT}
          onClick={() =>
            sceneRef.current?.setObjectFootprint(
              objectFootprintWidth + 1,
              objectFootprintHeight
            )
          }
          type="button"
        >
          <PlusCircleIcon aria-hidden="true" size={31} weight="fill" />
        </button>
      </div>
      <span className="studio-footprint-stepper__axis">H:</span>
      <div className="studio-footprint-stepper__control">
        <button
          aria-label="Decrease footprint height"
          disabled={disabled || objectFootprintHeight <= MIN_OBJECT_FOOTPRINT}
          onClick={() =>
            sceneRef.current?.setObjectFootprint(
              objectFootprintWidth,
              objectFootprintHeight - 1
            )
          }
          type="button"
        >
          <MinusCircleIcon aria-hidden="true" size={31} weight="fill" />
        </button>
        <strong>{objectFootprintHeight}</strong>
        <button
          aria-label="Increase footprint height"
          disabled={disabled || objectFootprintHeight >= MAX_OBJECT_FOOTPRINT}
          onClick={() =>
            sceneRef.current?.setObjectFootprint(
              objectFootprintWidth,
              objectFootprintHeight + 1
            )
          }
          type="button"
        >
          <PlusCircleIcon aria-hidden="true" size={31} weight="fill" />
        </button>
      </div>
    </div>
  );

  if (!openWorld) {
    return (
      <section className="studio-page">
        <div className="studio-world-browser">
          <section className="studio-world-browser__header">
            <div className="studio-section-heading">
              <p className="eyebrow">World Studio</p>
              <h2>Worlds</h2>
            </div>
            <div className="studio-world-create">
              <label className="studio-layer-select">
                New world name
                <input
                  value={newWorldName}
                  onChange={(event) => setNewWorldName(event.target.value)}
                />
              </label>
              <button
                className="studio-primary-action"
                disabled={!generatedTerrains.length || readOnly || !workspaceId}
                onClick={createWorld}
                type="button"
              >
                Create World
              </button>
            </div>
          </section>

          {!generatedTerrains.length ? (
            <div className="studio-library-empty">
              Generate at least one terrain tileset before creating a new world.
              Saved worlds can still be opened if they include their terrain
              assets.
            </div>
          ) : null}

          {mapStatus ? (
            <div className="studio-generator-status" data-state="error">
              {mapStatus}
            </div>
          ) : null}

          {savedWorlds.length > 0 ? (
            <div className="studio-world-list">
              {savedWorlds.map((world) => (
                <button
                  className="studio-world-card"
                  key={world._id}
                  onClick={() => openSavedWorld(world)}
                  type="button"
                >
                  <WorldMapThumbnail
                    availableObjectAssets={thumbnailObjectAssets}
                    availableTerrainAssets={thumbnailTerrainAssets}
                    world={world}
                  />
                  <div className="studio-world-card__details">
                    <strong>{world.name}</strong>
                    <small>
                      {world.width}x{world.height} ·{" "}
                      {formatUpdatedAt(world.updatedAt)}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-empty-module studio-empty-module--page">
              <span aria-hidden="true" />
              <h2>No Saved Worlds</h2>
              <p>Create a world to open the editor and start painting.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="studio-page studio-page--world">
      <div
        className="studio-workspace studio-workspace--world"
        data-loading={isWorldLoading ? "" : undefined}
      >
        <div className="studio-world-topbar" aria-label="World controls">
          <button
            className="studio-icon-command studio-icon-command--labeled"
            onClick={closeWorld}
            type="button"
          >
            <ArrowLeftIcon aria-hidden="true" size={18} weight="bold" />
            <span>Worlds</span>
          </button>
          <label className="studio-world-field studio-world-field--name">
            <span>Name</span>
            <input
              disabled={readOnly}
              value={worldName}
              onChange={(event) => setWorldName(event.target.value)}
            />
          </label>
          <label className="studio-world-field">
            <span>Layer 0</span>
            <select
              disabled={readOnly}
              value={baseTerrainId}
              onChange={(event) =>
                setBaseTerrainId(event.target.value as TerrainVisualAssetId)
              }
            >
              {editorTerrainAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label ?? terrainLabel(asset.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="studio-world-size-control">
            <span>Size</span>
            <label>
              <span>W</span>
              <input
                aria-label="World width"
                disabled={readOnly}
                min="5"
                max="200"
                type="number"
                value={mapSize.width}
                onChange={(event) =>
                  setMapSize((current) => ({
                    ...current,
                    width: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>H</span>
              <input
                aria-label="World height"
                disabled={readOnly}
                min="5"
                max="200"
                type="number"
                value={mapSize.height}
                onChange={(event) =>
                  setMapSize((current) => ({
                    ...current,
                    height: Number(event.target.value),
                  }))
                }
              />
            </label>
            <button
              aria-label="Resize world"
              className="studio-icon-command"
              disabled={readOnly}
              onClick={() => {
                const resized =
                  sceneRef.current?.resizeMap(mapSize.width, mapSize.height) ??
                  false;

                setMapStatus(
                  resized
                    ? "Resized world."
                    : "Use a width and height from 5 to 200."
                );
              }}
              type="button"
            >
              <ResizeIcon aria-hidden="true" size={18} weight="bold" />
            </button>
          </div>
          <label className="studio-world-autosave">
            <input
              checked={autoSaveEnabled}
              disabled={readOnly}
              onChange={(event) => setAutoSaveEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>Auto save</span>
          </label>
          <details className="studio-world-more">
            <summary aria-label="World actions">
              <DotsThreeIcon aria-hidden="true" size={26} weight="bold" />
            </summary>
            <div className="studio-world-menu">
              <button
                disabled={
                  readOnly ||
                  !paintableTerrains.length ||
                  toolMode !== "terrain"
                }
                onClick={() => sceneRef.current?.fillActiveLayer()}
                type="button"
              >
                <PaintBrushIcon aria-hidden="true" size={17} weight="bold" />
                Fill layer
              </button>
              <button
                disabled={
                  readOnly ||
                  !paintableTerrains.length ||
                  toolMode !== "terrain"
                }
                onClick={() => sceneRef.current?.clearActiveLayer()}
                type="button"
              >
                <EraserIcon aria-hidden="true" size={17} weight="bold" />
                Clear layer
              </button>
              <button
                disabled={readOnly || !editorObjectAssets.length}
                onClick={() => sceneRef.current?.clearObjects()}
                type="button"
              >
                <BroomIcon aria-hidden="true" size={17} weight="bold" />
                Clear objects
              </button>
              <button
                disabled={readOnly}
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                <UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />
                Import JSON
              </button>
              <button
                onClick={() => {
                  const map = sceneRef.current?.getExport();
                  if (map) {
                    downloadStudioMap(map);
                    setMapStatus("Exported world JSON.");
                  }
                }}
                type="button"
              >
                <DownloadSimpleIcon
                  aria-hidden="true"
                  size={17}
                  weight="bold"
                />
                Export JSON
              </button>
              <button
                disabled={readOnly || !workspaceId}
                onClick={() => void saveWorld()}
                type="button"
              >
                <FloppyDiskIcon aria-hidden="true" size={17} weight="bold" />
                Save cloud
              </button>
              <label className="studio-world-menu__toggle">
                <input
                  checked={showGrid}
                  onChange={(event) =>
                    sceneRef.current?.setGridVisible(event.target.checked)
                  }
                  type="checkbox"
                />
                <GridFourIcon aria-hidden="true" size={17} weight="bold" />
                <span>Show grid</span>
              </label>
              <input
                ref={importInputRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  void handleImport(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </details>
        </div>

        <div className="studio-world-body">
          <aside className="studio-world-palette" aria-label="Editor palette">
            <SegmentedControl
              ariaLabel="Editor tool"
              className="studio-world-tool-tabs"
              value={toolMode}
              onChange={(mode) => sceneRef.current?.setToolMode(mode)}
              options={
                [
                  { label: "Terrain", value: "terrain" },
                  {
                    disabled: !editorObjectAssets.length,
                    label: "Object",
                    value: "object",
                  },
                ] as const
              }
            />

            <label className="studio-layer-select">
              Active layer
              <select
                value={selectedLayer}
                onChange={(event) =>
                  sceneRef.current?.setSelectedLayer(Number(event.target.value))
                }
              >
                {STUDIO_LAYER_OPTIONS.map((layer) => (
                  <option key={layer} value={layer}>
                    Layer {layer}
                  </option>
                ))}
              </select>
            </label>

            {toolMode === "terrain" ? (
              <>
                {paintableTerrains.length ? (
                  <div className="studio-world-palette-grid">
                    {paintableTerrains.map((asset) => (
                      <button
                        className="studio-world-terrain-option"
                        data-active={
                          selectedTerrain === asset.id ? "" : undefined
                        }
                        disabled={isWorldLoading}
                        key={asset.id}
                        onClick={() =>
                          sceneRef.current?.setSelectedTerrain(
                            asset.id as TerrainVisualAssetId
                          )
                        }
                        type="button"
                      >
                        <span className="studio-terrain-button__thumb">
                          <img src={asset.centerVariantsUrl} alt="" />
                        </span>
                        <span>
                          <strong>
                            {asset.label ?? terrainLabel(asset.id)}
                          </strong>
                          <small>{asset.id}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="studio-note">
                    Add another generated terrain to paint above the base layer.
                  </p>
                )}
              </>
            ) : (
              <>
                <SegmentedControl
                  ariaLabel="Object category"
                  className="studio-object-category-tabs"
                  value={objectCategoryFilter}
                  onChange={setObjectCategoryFilter}
                  options={(["plants", "buildings", "objects"] as const).map(
                    (category) => ({
                      label: objectCategoryLabel(category),
                      value: category,
                    })
                  )}
                />
                {filteredObjectAssets.length > 0 ? (
                  <div
                    className="studio-world-palette-grid studio-world-palette-grid--objects"
                    ref={objectPaletteRef}
                  >
                    {filteredObjectAssets.map((asset) =>
                      Array.from(
                        { length: asset.rows * asset.columns },
                        (_, frame) => (
                          <button
                            className="studio-world-object-option"
                            data-active={
                              selectedObjectId === asset.id &&
                              selectedObjectFrame === frame
                                ? ""
                                : undefined
                            }
                            data-object-frame={frame}
                            data-object-id={asset.id}
                            data-object-palette-option=""
                            disabled={isWorldLoading}
                            key={`${asset.id}-${frame}`}
                            onClick={() => {
                              sceneRef.current?.setObjectPaintMode("place");
                              sceneRef.current?.setSelectedObjectVariant(
                                asset.id,
                                frame
                              );
                            }}
                            type="button"
                          >
                            <span
                              className="studio-object-palette__thumb"
                              style={{
                                backgroundImage: `url(${asset.imageUrl})`,
                                backgroundPosition:
                                  objectFrameBackgroundPosition(asset, frame),
                                backgroundSize: `${asset.columns * 100}% ${
                                  asset.rows * 100
                                }%`,
                              }}
                            />
                            <strong>{asset.label}</strong>
                            <small>{objectFrameLabel(asset, frame)}</small>
                          </button>
                        )
                      )
                    )}
                  </div>
                ) : (
                  <div className="studio-library-empty">
                    No {objectCategoryLabel(objectCategoryFilter).toLowerCase()}{" "}
                    available yet.
                  </div>
                )}
              </>
            )}
          </aside>

          <div className="studio-canvas-shell studio-canvas-shell--world">
            <button
              aria-label="Undo"
              className="studio-canvas-undo"
              disabled={!canUndo || isWorldLoading}
              onClick={() => sceneRef.current?.undo()}
              title="Undo"
              type="button"
            >
              <ArrowCounterClockwiseIcon
                aria-hidden="true"
                size={20}
                weight="bold"
              />
            </button>
            <div className="studio-floating-toolbar" aria-label="Tool options">
              <div className="studio-floating-toolbar__panel studio-floating-toolbar__panel--mode">
                {toolMode === "terrain" ? (
                  <SegmentedControl
                    ariaLabel="Terrain paint mode"
                    className="studio-floating-mode"
                    value={paintMode}
                    onChange={(mode) => sceneRef.current?.setPaintMode(mode)}
                    options={
                      [
                        {
                          disabled: !paintableTerrains.length,
                          label: "Paint",
                          value: "paint",
                        },
                        {
                          disabled: !paintableTerrains.length,
                          label: "Erase",
                          value: "erase",
                        },
                      ] as const
                    }
                  />
                ) : (
                  <SegmentedControl
                    ariaLabel="Object placement mode"
                    className="studio-floating-mode"
                    value={objectPaintMode}
                    onChange={(mode) =>
                      sceneRef.current?.setObjectPaintMode(mode)
                    }
                    options={
                      [
                        { label: "Place", value: "place" },
                        { label: "Select", value: "select" },
                        { label: "Erase", value: "erase" },
                      ] as const
                    }
                  />
                )}
              </div>
              <div className="studio-floating-toolbar__panel studio-floating-toolbar__panel--control">
                {toolMode === "terrain" ? (
                  <>
                    <span className="studio-floating-toolbar__label">
                      {paintMode === "erase" ? (
                        <EraserIcon
                          aria-hidden="true"
                          size={17}
                          weight="bold"
                        />
                      ) : (
                        <PaintBrushIcon
                          aria-hidden="true"
                          size={17}
                          weight="bold"
                        />
                      )}
                      {paintMode === "erase" ? "Eraser" : "Brush"}
                    </span>
                    <SegmentedControl
                      ariaLabel="Brush size"
                      className="studio-brush-size-control"
                      value={brushSize}
                      onChange={(size) => sceneRef.current?.setBrushSize(size)}
                      options={[1, 3, 5].map((size) => ({
                        disabled: !paintableTerrains.length,
                        label: `${size}x${size}`,
                        value: size,
                      }))}
                    />
                  </>
                ) : objectPaintMode === "select" ? (
                  hasSelectedObjectPlacement ? (
                    <div className="studio-selected-object-controls">
                      {renderObjectFootprintStepper()}
                      <button
                        aria-label="Delete selected object"
                        className="studio-selected-object-delete"
                        onClick={() => sceneRef.current?.deleteSelectedObject()}
                        type="button"
                      >
                        <TrashIcon aria-hidden="true" size={18} weight="bold" />
                      </button>
                    </div>
                  ) : null
                ) : objectPaintMode === "erase" ? (
                  <>
                    <span className="studio-floating-toolbar__label">
                      <EraserIcon aria-hidden="true" size={17} weight="bold" />
                      Eraser
                    </span>
                    <SegmentedControl
                      ariaLabel="Eraser size"
                      className="studio-brush-size-control"
                      value={brushSize}
                      onChange={(size) => sceneRef.current?.setBrushSize(size)}
                      options={[1, 3, 5].map((size) => ({
                        label: `${size}x${size}`,
                        value: size,
                      }))}
                    />
                  </>
                ) : (
                  renderObjectFootprintStepper()
                )}
              </div>
            </div>
            <div id={gameHostIdRef.current} className="studio-game-host" />
            <section className="studio-world-status-overlay" aria-live="polite">
              <p>{worldSizeLabel}</p>
              <p>{toolSummary}</p>
              <p>{helpMessage}</p>
            </section>
            {isWorldLoading ? (
              <div className="studio-world-loading" role="status">
                <span aria-hidden="true" />
                <strong>Loading World Assets</strong>
                <p>Preparing terrain textures before opening the editor.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorldMapThumbnail({
  availableObjectAssets,
  availableTerrainAssets,
  world,
}: {
  availableObjectAssets: StudioObjectSpriteAsset[];
  availableTerrainAssets: TerrainVisualAsset[];
  world: StudioMapRecord;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const map = useMemo(() => parseStudioMapRecord(world), [world.mapJson]);
  const terrainAssets = useMemo(
    () =>
      map
        ? mergeTerrainAssets([
            ...availableTerrainAssets,
            ...(map.terrainAssets ?? []),
          ])
        : [],
    [availableTerrainAssets, map]
  );
  const objectAssets = useMemo(
    () =>
      map
        ? mergeObjectAssets([
            ...(map.objectAssets ?? []),
            ...availableObjectAssets,
          ])
        : [],
    [availableObjectAssets, map]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) {
      return;
    }

    let cancelled = false;

    void renderWorldMapThumbnail(
      canvas,
      map,
      terrainAssets,
      objectAssets,
      () => cancelled
    ).catch(() => {
      if (!cancelled) {
        drawWorldThumbnailFallback(canvas);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [map, objectAssets, terrainAssets]);

  if (!map) {
    return (
      <div
        aria-hidden="true"
        className="studio-world-card__thumbnail studio-world-card__thumbnail--fallback"
      >
        <span className="studio-world-card__thumbnail-fallback">
          <GridFourIcon aria-hidden="true" size={28} weight="bold" />
        </span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="studio-world-card__thumbnail">
      <canvas
        height={WORLD_THUMBNAIL_HEIGHT}
        ref={canvasRef}
        width={WORLD_THUMBNAIL_WIDTH}
      />
    </div>
  );
}

const thumbnailImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function parseStudioMapRecord(world: StudioMapRecord) {
  try {
    const parsed = JSON.parse(world.mapJson) as unknown;
    validateStudioMap(parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function renderWorldMapThumbnail(
  canvas: HTMLCanvasElement,
  map: StudioMapExport,
  terrainAssets: TerrainVisualAsset[],
  objectAssets: StudioObjectSpriteAsset[],
  isCancelled: () => boolean
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const terrainAssetById = new Map(
    terrainAssets.map((asset) => [asset.id, asset])
  );
  const objectAssetById = new Map(
    objectAssets.map((asset) => [asset.id, asset])
  );
  const terrainImages = await loadThumbnailTerrainImages(map, terrainAssetById);
  const objectImages = await loadThumbnailObjectImages(map, objectAssetById);

  if (isCancelled()) {
    return;
  }

  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(WORLD_THUMBNAIL_WIDTH * pixelRatio);
  canvas.height = Math.round(WORLD_THUMBNAIL_HEIGHT * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, WORLD_THUMBNAIL_WIDTH, WORLD_THUMBNAIL_HEIGHT);
  context.fillStyle = "#17211e";
  context.fillRect(0, 0, WORLD_THUMBNAIL_WIDTH, WORLD_THUMBNAIL_HEIGHT);
  const viewport = getWorldThumbnailViewport(map);

  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = "#10201d";
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);

  drawThumbnailBaseTerrain(context, map, viewport, terrainImages);
  drawThumbnailTerrainLayers(context, map, viewport, terrainImages);
  drawThumbnailObjects(context, map, viewport, objectAssetById, objectImages);
  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.24)";
  context.lineWidth = 1;
  context.strokeRect(
    viewport.x + 0.5,
    viewport.y + 0.5,
    viewport.width - 1,
    viewport.height - 1
  );
}

function drawWorldThumbnailFallback(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#17211e";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(159, 216, 189, 0.18)";
  context.lineWidth = 1;

  for (let x = 12; x < canvas.width; x += 18) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = 12; y < canvas.height; y += 18) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
}

async function loadThumbnailTerrainImages(
  map: StudioMapExport,
  terrainAssetById: Map<string, TerrainVisualAsset>
) {
  const images = new Map<string, HTMLImageElement | null>();
  const terrainIds = new Set<string>([
    map.baseTerrain,
    ...map.layers.map((layer) => layer.terrainId),
  ]);

  await Promise.all(
    [...terrainIds].map(async (terrainId) => {
      const asset = terrainAssetById.get(terrainId);
      images.set(terrainId, await loadThumbnailImage(asset?.centerVariantsUrl));
    })
  );

  return images;
}

async function loadThumbnailObjectImages(
  map: StudioMapExport,
  objectAssetById: Map<string, StudioObjectSpriteAsset>
) {
  const images = new Map<string, HTMLImageElement | null>();
  const objectIds = new Set(
    (map.objects ?? []).map((object) => object.assetId)
  );

  await Promise.all(
    [...objectIds].map(async (objectId) => {
      const asset = objectAssetById.get(objectId);
      images.set(objectId, await loadThumbnailImage(asset?.imageUrl));
    })
  );

  return images;
}

function loadThumbnailImage(url: string | undefined) {
  if (!url) {
    return Promise.resolve(null);
  }

  const cached = thumbnailImageCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  thumbnailImageCache.set(url, promise);

  return promise;
}

function getWorldThumbnailViewport(map: StudioMapExport) {
  const availableWidth = WORLD_THUMBNAIL_WIDTH - WORLD_THUMBNAIL_PADDING * 2;
  const availableHeight = WORLD_THUMBNAIL_HEIGHT - WORLD_THUMBNAIL_PADDING * 2;
  const tileSize = Math.min(
    availableWidth / map.width,
    availableHeight / map.height
  );
  const width = map.width * tileSize;
  const height = map.height * tileSize;

  return {
    x: (WORLD_THUMBNAIL_WIDTH - width) / 2,
    y: (WORLD_THUMBNAIL_HEIGHT - height) / 2,
    width,
    height,
    tileSize,
  };
}

function drawThumbnailBaseTerrain(
  context: CanvasRenderingContext2D,
  map: StudioMapExport,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  terrainImages: Map<string, HTMLImageElement | null>
) {
  const image = terrainImages.get(map.baseTerrain) ?? null;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      drawThumbnailTerrainTile(context, viewport, x, y, map.baseTerrain, image);
    }
  }
}

function drawThumbnailTerrainLayers(
  context: CanvasRenderingContext2D,
  map: StudioMapExport,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  terrainImages: Map<string, HTMLImageElement | null>
) {
  const layers = [...map.layers].sort(
    (left, right) =>
      (left.layer ?? 1) - (right.layer ?? 1) ||
      left.terrainId.localeCompare(right.terrainId)
  );

  for (const layer of layers) {
    const image = terrainImages.get(layer.terrainId) ?? null;

    for (const [x, y] of layer.cells) {
      drawThumbnailTerrainTile(context, viewport, x, y, layer.terrainId, image);
    }
  }
}

function drawThumbnailTerrainTile(
  context: CanvasRenderingContext2D,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  tileX: number,
  tileY: number,
  terrainId: string,
  image: HTMLImageElement | null
) {
  const x = Math.floor(viewport.x + tileX * viewport.tileSize);
  const y = Math.floor(viewport.y + tileY * viewport.tileSize);
  const width = Math.max(
    1,
    Math.ceil(viewport.x + (tileX + 1) * viewport.tileSize) - x
  );
  const height = Math.max(
    1,
    Math.ceil(viewport.y + (tileY + 1) * viewport.tileSize) - y
  );

  if (!image) {
    context.fillStyle = getTerrainFallbackColor(terrainId);
    context.fillRect(x, y, width, height);
    return;
  }

  const sourceWidth = image.naturalWidth / TERRAIN_CENTER_VARIANT_COLUMNS;
  const sourceHeight = image.naturalHeight / TERRAIN_CENTER_VARIANT_ROWS;
  const variant = hashThumbnailVariant(
    tileX,
    tileY,
    TERRAIN_CENTER_VARIANT_COLUMNS * TERRAIN_CENTER_VARIANT_ROWS
  );
  const sourceX = (variant % TERRAIN_CENTER_VARIANT_COLUMNS) * sourceWidth;
  const sourceY =
    Math.floor(variant / TERRAIN_CENTER_VARIANT_COLUMNS) * sourceHeight;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

function drawThumbnailObjects(
  context: CanvasRenderingContext2D,
  map: StudioMapExport,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  objectAssetById: Map<string, StudioObjectSpriteAsset>,
  objectImages: Map<string, HTMLImageElement | null>
) {
  const objects = [...(map.objects ?? [])].sort(
    (left, right) =>
      getThumbnailObjectDepth(left) - getThumbnailObjectDepth(right) ||
      left.x - right.x ||
      left.assetId.localeCompare(right.assetId)
  );

  for (const object of objects) {
    const asset = objectAssetById.get(object.assetId);
    const image = objectImages.get(object.assetId) ?? null;

    if (!asset || !image) {
      drawThumbnailObjectFallback(context, viewport, object);
      continue;
    }

    drawThumbnailObject(context, viewport, object, asset, image);
  }
}

function drawThumbnailObject(
  context: CanvasRenderingContext2D,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  object: StudioMapObjectPlacement,
  asset: StudioObjectSpriteAsset,
  image: HTMLImageElement
) {
  const width = object.width ?? 1;
  const height = object.height ?? 1;
  const crop = getThumbnailObjectCrop(asset, image, object.frame);
  const targetWidth = width * viewport.tileSize;
  const targetHeight = height * viewport.tileSize;
  const scale =
    Math.min(targetWidth / crop.width, targetHeight / crop.height) *
    getThumbnailObjectFrameScale(asset, object.frame);
  const drawWidth = Math.max(1, crop.width * scale);
  const drawHeight = Math.max(1, crop.height * scale);
  const centerX = viewport.x + (object.x + width / 2) * viewport.tileSize;
  const centerY = viewport.y + (object.y + height / 2) * viewport.tileSize;

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    centerX - drawWidth / 2,
    centerY - drawHeight / 2,
    drawWidth,
    drawHeight
  );
}

function drawThumbnailObjectFallback(
  context: CanvasRenderingContext2D,
  viewport: ReturnType<typeof getWorldThumbnailViewport>,
  object: StudioMapObjectPlacement
) {
  context.fillStyle = "rgba(23, 33, 30, 0.58)";
  context.fillRect(
    viewport.x + object.x * viewport.tileSize,
    viewport.y + object.y * viewport.tileSize,
    (object.width ?? 1) * viewport.tileSize,
    (object.height ?? 1) * viewport.tileSize
  );
}

function getThumbnailObjectCrop(
  asset: StudioObjectSpriteAsset,
  image: HTMLImageElement,
  frame: number
) {
  const columns = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const frameCount = rows * columns;
  const boundedFrame = Math.min(frameCount - 1, Math.max(0, Math.floor(frame)));
  const frameWidth = image.naturalWidth / columns;
  const frameHeight = image.naturalHeight / rows;
  const column = boundedFrame % columns;
  const row = Math.floor(boundedFrame / columns);

  return {
    x: Math.round(column * frameWidth),
    y: Math.round(row * frameHeight),
    width: Math.round(frameWidth),
    height: Math.round(frameHeight),
  };
}

function getThumbnailObjectDepth(object: StudioMapObjectPlacement) {
  return (
    (object.y + (object.height ?? 1) - 1) * (STUDIO_LAYER_OPTIONS.length + 1) +
    (object.layer ?? 1)
  );
}

function getThumbnailObjectFrameScale(
  asset: StudioObjectSpriteAsset,
  frame: number
) {
  if (asset.kind !== "tree") {
    return 1;
  }

  const row = Math.floor(frame / Math.max(1, asset.columns));
  const column = frame % Math.max(1, asset.columns);
  const grownRow = Math.min(2, Math.max(1, asset.rows) - 1);

  return row === grownRow ? 1 + column * 0.15 : 1;
}

function getTerrainFallbackColor(terrainId: string) {
  if (terrainId.includes("water")) {
    return "#4aa6ba";
  }
  if (terrainId.includes("stone")) {
    return "#8d9aa5";
  }
  if (terrainId.includes("dirt")) {
    return "#9a6b43";
  }
  if (terrainId.includes("forest")) {
    return "#35724c";
  }
  if (terrainId.includes("grass")) {
    return "#69a963";
  }

  const hue = hashThumbnailVariant(
    terrainId.length,
    terrainId.charCodeAt(0),
    8
  );
  const palette = [
    "#7cbf72",
    "#c1a36a",
    "#76a6b7",
    "#9b87bd",
    "#b78472",
    "#7aa783",
    "#b5bd78",
    "#7c92bd",
  ];

  return palette[hue] ?? "#7cbf72";
}

function hashThumbnailVariant(x: number, y: number, variants: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  const normalized = value - Math.floor(value);

  return Math.floor(normalized * variants) % variants;
}

function mergeTerrainAssets(assets: TerrainVisualAsset[]) {
  const merged = new Map<string, TerrainVisualAsset>();

  for (const asset of assets) {
    if (!asset.id || !asset.atlasUrl || !asset.centerVariantsUrl) {
      continue;
    }

    merged.set(asset.id, asset);
  }

  return [...merged.values()];
}

function plantSpritesToObjectAssets(
  plantSprites: StudioPlantSpriteRecord[]
): StudioObjectSpriteAsset[] {
  return plantSprites.flatMap((sprite) => {
    if (!sprite.url) {
      return [];
    }

    return [
      {
        id: sprite.plantId,
        label: sprite.label,
        category: "plants",
        kind: sprite.kind,
        imageUrl: sprite.url,
        frameSize: sprite.cellSize,
        rows: sprite.rows,
        columns: sprite.columns,
      },
    ];
  });
}

function objectSpritesToObjectAssets(
  objectSprites: StudioObjectSpriteRecord[]
): StudioObjectSpriteAsset[] {
  return objectSprites.flatMap((sprite) => {
    if (!sprite.url) {
      return [];
    }

    return [
      {
        id: sprite.objectId,
        label: sprite.label,
        category: sprite.kind === "building" ? "buildings" : "objects",
        kind: sprite.kind,
        imageUrl: sprite.url,
        frameSize: 256,
        rows: 1,
        columns: 1,
      },
    ];
  });
}

function mergeObjectAssets(assets: StudioObjectSpriteAsset[]) {
  const merged = new Map<string, StudioObjectSpriteAsset>();

  for (const asset of assets) {
    if (!asset.id || !asset.imageUrl) {
      continue;
    }

    merged.set(asset.id, asset);
  }

  return [...merged.values()];
}

function objectFrameBackgroundPosition(
  asset: StudioObjectSpriteAsset,
  frame: number
) {
  const column = frame % asset.columns;
  const row = Math.floor(frame / asset.columns);
  const x = asset.columns <= 1 ? 0 : (column / (asset.columns - 1)) * 100;
  const y = asset.rows <= 1 ? 0 : (row / (asset.rows - 1)) * 100;

  return `${x}% ${y}%`;
}

function objectFrameLabel(asset: StudioObjectSpriteAsset, frame: number) {
  if (asset.category !== "plants") {
    return "Single sprite";
  }

  const row = Math.floor(frame / asset.columns);
  const column = frame % asset.columns;

  if (asset.kind === "plant") {
    const plantLabels = [
      ["Seed 1", "Seed 2", "Seed 3", "Seed 4"],
      ["Grow 1", "Grow 2", "Grow 3", "Grow 4"],
      ["Grown 1", "Grown 2", "Dry", "Dead"],
      ["Harvest 1", "Harvested", "High Quality 1", "High Quality 2"],
    ];
    return plantLabels[row]?.[column] ?? `Row ${row + 1} ${column + 1}`;
  }

  const rowLabels = ["Seed", "Grow", "Grown", "Harvest"];

  return `${rowLabels[row] ?? `Row ${row + 1}`} ${column + 1}`;
}

function objectCategoryLabel(
  category: StudioObjectSpriteAsset["category"] | undefined
) {
  switch (category) {
    case "buildings":
      return "Buildings";
    case "objects":
      return "Objects";
    case "plants":
    default:
      return "Plants";
  }
}

function formatUpdatedAt(updatedAt: number) {
  if (!Number.isFinite(updatedAt)) {
    return "saved";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}

function createWorldSnapshot(
  name: string,
  map: StudioMapExport,
  autoSave: boolean
) {
  return JSON.stringify({
    autoSave,
    map,
    name,
  });
}

function readWorldStudioSettings(): WorldStudioSettings {
  try {
    const raw = window.localStorage.getItem(WORLD_STUDIO_SETTINGS_KEY);
    if (!raw) {
      return defaultWorldStudioSettings();
    }

    const parsed = JSON.parse(raw) as Partial<WorldStudioSettings>;
    return {
      ...defaultWorldStudioSettings(),
      ...parsed,
      autoSave: parsed.autoSave ?? true,
    };
  } catch {
    return defaultWorldStudioSettings();
  }
}

function writeWorldStudioSettings(settings: WorldStudioSettings) {
  window.localStorage.setItem(
    WORLD_STUDIO_SETTINGS_KEY,
    JSON.stringify(settings)
  );
}

function defaultWorldStudioSettings(): WorldStudioSettings {
  return {
    autoSave: true,
    brushSize: 1,
    objectFootprintHeight: 1,
    objectFootprintWidth: 1,
    objectPaintMode: "place",
    paintMode: "paint",
    selectedLayer: 1,
    selectedObject: "",
    selectedObjectFrame: 0,
    selectedTerrain: "",
    showGrid: true,
    toolMode: "terrain",
  };
}
