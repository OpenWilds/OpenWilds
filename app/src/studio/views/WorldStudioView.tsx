import Phaser from "phaser";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  TerrainVisualAsset,
  TerrainVisualAssetId,
} from "../../assets/visual-assets";
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
  objectPaintMode: "place" | "erase";
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

export function WorldStudioView({
  generatedTerrains,
  objectSprites,
  plantSprites,
  savedWorlds,
}: {
  generatedTerrains: TerrainVisualAsset[];
  objectSprites: StudioObjectSpriteRecord[];
  plantSprites: StudioPlantSpriteRecord[];
  savedWorlds: StudioMapRecord[];
}) {
  const sceneRef = useRef<StudioScene | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
  const [isTerrainModalOpen, setIsTerrainModalOpen] = useState(false);
  const [isObjectModalOpen, setIsObjectModalOpen] = useState(false);
  const [objectCategoryFilter, setObjectCategoryFilter] = useState<
    StudioObjectSpriteAsset["category"]
  >("plants");
  const editorTerrainAssets = useMemo(
    () =>
      mergeTerrainAssets([
        ...generatedTerrains,
        ...(openWorld?.map?.terrainAssets ?? []),
      ]),
    [generatedTerrains, openWorld]
  );
  const editorObjectAssets = useMemo(
    () =>
      mergeObjectAssets([
        ...plantSpritesToObjectAssets(plantSprites),
        ...objectSpritesToObjectAssets(objectSprites),
        ...(openWorld?.map?.objectAssets ?? []),
      ]),
    [objectSprites, openWorld, plantSprites]
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
  const selectedPaintTerrain = paintableTerrains.find(
    (asset) => asset.id === selectedTerrain
  );
  const toolMode = state?.toolMode ?? "terrain";
  const paintMode = state?.paintMode ?? "paint";
  const objectPaintMode = state?.objectPaintMode ?? "place";
  const objectFootprintWidth = state?.objectFootprintWidth ?? 1;
  const objectFootprintHeight = state?.objectFootprintHeight ?? 1;
  const brushSize = state?.brushSize ?? 1;
  const showGrid = state?.showGrid ?? true;
  const helpMessage =
    mapStatus ??
    (state?.message === DEFAULT_STUDIO_HELP || !state?.message
      ? LAYERED_STUDIO_HELP
      : state.message);

  useEffect(() => {
    if (state) {
      setMapSize({ width: state.width, height: state.height });
    }
  }, [state?.width, state?.height]);

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
  ]);

  const handleImport = async (file: File | undefined) => {
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

    const savedWorldId = await saveStudioMapToConvex(
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
                disabled={!generatedTerrains.length}
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
                  <span aria-hidden="true">WS</span>
                  <strong>{world.name}</strong>
                  <small>
                    {world.width}x{world.height} ·{" "}
                    {formatUpdatedAt(world.updatedAt)}
                  </small>
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
        <div
          className="studio-world-controls"
          aria-label="World studio controls"
        >
          <section className="studio-world-controls__group">
            <h2>World</h2>
            <button
              className="studio-command"
              onClick={closeWorld}
              type="button"
            >
              Worlds
            </button>
            <label className="studio-layer-select">
              Name
              <input
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
              />
            </label>
            <label className="studio-layer-select">
              Layer 0
              <select
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
            <label className="studio-toggle">
              <input
                checked={autoSaveEnabled}
                onChange={(event) => setAutoSaveEnabled(event.target.checked)}
                type="checkbox"
              />
              Auto save
            </label>
          </section>

          <section className="studio-world-controls__group">
            <h2>Tool</h2>
            <div className="studio-segmented studio-segmented--tight">
              <button
                data-active={toolMode === "terrain" ? "" : undefined}
                onClick={() => sceneRef.current?.setToolMode("terrain")}
                type="button"
              >
                Terrain
              </button>
              <button
                data-active={toolMode === "object" ? "" : undefined}
                disabled={!editorObjectAssets.length}
                onClick={() => sceneRef.current?.setToolMode("object")}
                type="button"
              >
                Object
              </button>
            </div>
          </section>

          <section className="studio-world-controls__group">
            <h2>Layer</h2>
            <label className="studio-layer-select">
              Slot
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
            <div className="studio-segmented studio-segmented--tight">
              <button
                data-active={paintMode === "paint" ? "" : undefined}
                disabled={!paintableTerrains.length || toolMode !== "terrain"}
                onClick={() => sceneRef.current?.setPaintMode("paint")}
                type="button"
              >
                Paint
              </button>
              <button
                data-active={paintMode === "erase" ? "" : undefined}
                disabled={!paintableTerrains.length || toolMode !== "terrain"}
                onClick={() => sceneRef.current?.setPaintMode("erase")}
                type="button"
              >
                Erase
              </button>
            </div>
          </section>

          <section className="studio-world-controls__group studio-world-controls__group--terrain">
            <h2>Place Objects</h2>
            {editorObjectAssets.length ? (
              <>
                <div className="studio-segmented studio-segmented--tight">
                  <button
                    data-active={objectPaintMode === "place" ? "" : undefined}
                    disabled={toolMode !== "object"}
                    onClick={() =>
                      sceneRef.current?.setObjectPaintMode("place")
                    }
                    type="button"
                  >
                    Place
                  </button>
                  <button
                    data-active={objectPaintMode === "erase" ? "" : undefined}
                    disabled={toolMode !== "object"}
                    onClick={() =>
                      sceneRef.current?.setObjectPaintMode("erase")
                    }
                    type="button"
                  >
                    Erase
                  </button>
                </div>
                <button
                  className="studio-object-select"
                  disabled={isWorldLoading}
                  onClick={() => {
                    if (selectedObject) {
                      setObjectCategoryFilter(selectedObject.category);
                    }
                    setIsObjectModalOpen(true);
                  }}
                  type="button"
                >
                  {selectedObject ? (
                    <span
                      className="studio-object-select__thumb"
                      style={{
                        backgroundImage: `url(${selectedObject.imageUrl})`,
                        backgroundPosition: objectFrameBackgroundPosition(
                          selectedObject,
                          selectedObjectFrame
                        ),
                        backgroundSize: `${selectedObject.columns * 100}% ${
                          selectedObject.rows * 100
                        }%`,
                      }}
                    />
                  ) : null}
                  <span>
                    <strong>{selectedObject?.label ?? "Choose object"}</strong>
                    <small>
                      {objectCategoryLabel(selectedObject?.category)} ·{" "}
                      {selectedObject
                        ? objectFrameLabel(selectedObject, selectedObjectFrame)
                        : "Variant 1"}
                    </small>
                  </span>
                </button>
                <div className="studio-size-row">
                  <label>
                    Width
                    <input
                      disabled={toolMode !== "object"}
                      min="1"
                      max="6"
                      type="number"
                      value={objectFootprintWidth}
                      onChange={(event) =>
                        sceneRef.current?.setObjectFootprint(
                          Number(event.target.value),
                          objectFootprintHeight
                        )
                      }
                    />
                  </label>
                  <label>
                    Height
                    <input
                      disabled={toolMode !== "object"}
                      min="1"
                      max="6"
                      type="number"
                      value={objectFootprintHeight}
                      onChange={(event) =>
                        sceneRef.current?.setObjectFootprint(
                          objectFootprintWidth,
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>
                </div>
              </>
            ) : (
              <p className="studio-note">
                Generate plant sprites in Plant Studio to place them here.
              </p>
            )}
          </section>

          <section className="studio-world-controls__group studio-world-controls__group--terrain">
            <h2>Paint Terrain</h2>
            {paintableTerrains.length ? (
              <button
                className="studio-terrain-select"
                disabled={isWorldLoading}
                onClick={() => setIsTerrainModalOpen(true)}
                type="button"
              >
                {selectedPaintTerrain ? (
                  <span className="studio-terrain-button__thumb">
                    <img src={selectedPaintTerrain.centerVariantsUrl} alt="" />
                  </span>
                ) : null}
                <span>
                  <strong>
                    {selectedPaintTerrain
                      ? selectedPaintTerrain.label ??
                        terrainLabel(selectedPaintTerrain.id)
                      : "Choose terrain"}
                  </strong>
                  <small>{paintableTerrains.length} paintable terrains</small>
                </span>
              </button>
            ) : (
              <p className="studio-note">
                Add another generated terrain to paint above the base layer.
              </p>
            )}
          </section>

          <section className="studio-world-controls__group">
            <h2>Brush</h2>
            <div className="studio-segmented" data-control="brush">
              {[1, 3, 5].map((size) => (
                <button
                  data-active={brushSize === size ? "" : undefined}
                  disabled={!paintableTerrains.length || toolMode !== "terrain"}
                  key={size}
                  onClick={() => sceneRef.current?.setBrushSize(size)}
                  type="button"
                >
                  {size}x{size}
                </button>
              ))}
            </div>
            <label className="studio-toggle">
              <input
                checked={showGrid}
                onChange={(event) =>
                  sceneRef.current?.setGridVisible(event.target.checked)
                }
                type="checkbox"
              />
              Show grid
            </label>
          </section>

          <section className="studio-world-controls__group">
            <h2>Size</h2>
            <div className="studio-size-row">
              <label>
                Width
                <input
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
                Height
                <input
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
            </div>
            <button
              className="studio-command"
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
              Resize
            </button>
          </section>

          <section className="studio-world-controls__group">
            <h2>Actions</h2>
            <div className="studio-command-grid">
              <button
                disabled={!paintableTerrains.length || toolMode !== "terrain"}
                onClick={() => sceneRef.current?.fillActiveLayer()}
                type="button"
              >
                Fill Layer
              </button>
              <button
                disabled={!paintableTerrains.length || toolMode !== "terrain"}
                onClick={() => sceneRef.current?.clearActiveLayer()}
                type="button"
              >
                Clear Layer
              </button>
            </div>
            <button
              className="studio-command"
              disabled={!editorObjectAssets.length}
              onClick={() => sceneRef.current?.clearObjects()}
              type="button"
            >
              Clear Objects
            </button>
            <div className="studio-command-grid">
              <button
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                Import JSON
              </button>
              <button onClick={() => void saveWorld()} type="button">
                Save Cloud
              </button>
            </div>
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
          </section>

          <section className="studio-world-status" aria-live="polite">
            <p>{state ? `${state.width}x${state.height} world` : "40x40"}</p>
            <p id="studio-tool-status">
              {toolMode === "object"
                ? `Objects · ${
                    selectedObject?.label ?? "None"
                  } · ${objectFootprintWidth}x${objectFootprintHeight} · ${objectPaintMode} · ${
                    state?.objectCount ?? 0
                  } placed`
                : `Layer ${selectedLayer} · ${terrainLabel(
                    selectedTerrain
                  )} · ${paintMode} · ${brushSize}x${brushSize} · ${
                    state?.activeLayerCellCount ?? 0
                  } cells`}
            </p>
            <p>{helpMessage}</p>
          </section>
        </div>

        <div className="studio-canvas-shell studio-canvas-shell--world">
          <div id={gameHostIdRef.current} className="studio-game-host" />
          {isWorldLoading ? (
            <div className="studio-world-loading" role="status">
              <span aria-hidden="true" />
              <strong>Loading World Assets</strong>
              <p>Preparing terrain textures before opening the editor.</p>
            </div>
          ) : null}
        </div>
      </div>
      {isTerrainModalOpen ? (
        <div
          className="studio-modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsTerrainModalOpen(false)}
        >
          <section
            aria-modal="true"
            className="studio-terrain-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="studio-terrain-modal__header">
              <div className="studio-section-heading">
                <p className="eyebrow">Paint Palette</p>
                <h2>Select Terrain</h2>
              </div>
              <button
                className="studio-command"
                onClick={() => setIsTerrainModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="studio-terrain-modal__list">
              {paintableTerrains.map((asset) => (
                <button
                  className="studio-terrain-modal__item"
                  data-active={selectedTerrain === asset.id ? "" : undefined}
                  key={asset.id}
                  onClick={() => {
                    sceneRef.current?.setSelectedTerrain(
                      asset.id as TerrainVisualAssetId
                    );
                    setIsTerrainModalOpen(false);
                  }}
                  type="button"
                >
                  <span className="studio-terrain-modal__thumb">
                    <img src={asset.centerVariantsUrl} alt="" />
                  </span>
                  <span className="studio-terrain-modal__copy">
                    <strong>{asset.label ?? terrainLabel(asset.id)}</strong>
                    <small>{asset.id}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {isObjectModalOpen ? (
        <div
          className="studio-modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsObjectModalOpen(false)}
        >
          <section
            aria-modal="true"
            className="studio-terrain-modal studio-object-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="studio-terrain-modal__header">
              <div className="studio-section-heading">
                <p className="eyebrow">Object Palette</p>
                <h2>Select Object</h2>
              </div>
              <button
                className="studio-command"
                onClick={() => setIsObjectModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="studio-object-category-tabs">
              {(["plants", "buildings", "objects"] as const).map(
                (category) => (
                  <button
                    data-active={
                      objectCategoryFilter === category ? "" : undefined
                    }
                    key={category}
                    onClick={() => setObjectCategoryFilter(category)}
                    type="button"
                  >
                    {objectCategoryLabel(category)}
                  </button>
                )
              )}
            </div>
            <div className="studio-object-modal__list">
              {filteredObjectAssets.length > 0 ? (
                filteredObjectAssets.map((asset) => (
                <article className="studio-object-modal__asset" key={asset.id}>
                  <div className="studio-object-modal__asset-header">
                    <strong>{asset.label}</strong>
                    <small>{asset.kind}</small>
                  </div>
                  <div className="studio-object-variant-grid">
                    {Array.from(
                      { length: asset.rows * asset.columns },
                      (_, frame) => (
                        <button
                          className="studio-object-variant"
                          data-active={
                            selectedObjectId === asset.id &&
                            selectedObjectFrame === frame
                              ? ""
                              : undefined
                          }
                          key={frame}
                          onClick={() => {
                            sceneRef.current?.setToolMode("object");
                            sceneRef.current?.setObjectPaintMode("place");
                            sceneRef.current?.setSelectedObjectVariant(
                              asset.id,
                              frame
                            );
                            setIsObjectModalOpen(false);
                          }}
                          type="button"
                        >
                          <span
                            style={{
                              backgroundImage: `url(${asset.imageUrl})`,
                              backgroundPosition: objectFrameBackgroundPosition(
                                asset,
                                frame
                              ),
                              backgroundSize: `${asset.columns * 100}% ${
                                asset.rows * 100
                              }%`,
                            }}
                          />
                          <small>{objectFrameLabel(asset, frame)}</small>
                        </button>
                      )
                    )}
                  </div>
                </article>
                ))
              ) : (
                <div className="studio-library-empty">
                  No {objectCategoryLabel(objectCategoryFilter).toLowerCase()}{" "}
                  available yet.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
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

function objectCategoryLabel(category: StudioObjectSpriteAsset["category"] | undefined) {
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
