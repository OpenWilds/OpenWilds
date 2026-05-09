import Phaser from "phaser";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  TerrainVisualAsset,
  TerrainVisualAssetId,
} from "../../assets/visual-assets";
import { saveStudioMapToConvex } from "../convex/convex-studio";
import { downloadStudioMap } from "../phaser/download-studio-map";
import {
  DEFAULT_STUDIO_HELP,
  getSwatchClass,
  initialTerrainAssets,
  LAYERED_STUDIO_HELP,
} from "../lib/studio-data";
import {
  STUDIO_HEIGHT,
  STUDIO_LAYER_OPTIONS,
  STUDIO_WIDTH,
  StudioScene,
  terrainLabel,
  validateStudioMap,
  type StudioSceneState,
} from "../phaser/studio-scene";

export function MapEditorView({
  generatedTerrains,
}: {
  generatedTerrains: TerrainVisualAsset[];
}) {
  const allTerrainAssets = useMemo(
    () => [...initialTerrainAssets(), ...generatedTerrains],
    [generatedTerrains]
  );
  const sceneRef = useRef<StudioScene | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<StudioSceneState | null>(null);
  const [mapSize, setMapSize] = useState({ width: 40, height: 40 });
  const [mapStatus, setMapStatus] = useState<string | null>(null);

  useEffect(() => {
    const scene = new StudioScene({
      terrainAssets: allTerrainAssets,
      onStateChange: setState,
    });
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "studio-game",
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      backgroundColor: "#17211e",
      scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    sceneRef.current = scene;
    gameRef.current = game;

    return () => {
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    for (const asset of generatedTerrains) {
      sceneRef.current?.addTerrainAsset(asset, false);
    }
  }, [generatedTerrains]);

  const selectedLayer = state?.selectedLayer ?? STUDIO_LAYER_OPTIONS[0];
  const selectedTerrain = state?.selectedTerrain ?? "uniswap-grass";
  const paintMode = state?.paintMode ?? "paint";
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
      sceneRef.current.importMap(parsed);
      setMapStatus("Imported map JSON.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import failed.");
    }
  };

  const saveMap = async () => {
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    try {
      const map = scene.getExport();
      await saveStudioMapToConvex(`Open Wilds ${map.width}x${map.height}`, map);
      setMapStatus("Saved map to Convex.");
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Could not save map."
      );
    }
  };

  return (
    <section className="studio-page">
      <div className="studio-workspace">
        <div className="studio-editor-toolbar" aria-label="Map tools">
          <button
            data-active={paintMode === "paint" ? "" : undefined}
            onClick={() => sceneRef.current?.setPaintMode("paint")}
            type="button"
            title="Paint"
          >
            Paint
          </button>
          <button
            data-active={paintMode === "erase" ? "" : undefined}
            onClick={() => sceneRef.current?.setPaintMode("erase")}
            type="button"
            title="Erase"
          >
            Erase
          </button>
          <button
            onClick={() => {
              const scene = sceneRef.current;
              if (scene) {
                downloadStudioMap(scene.getExport());
              }
            }}
            type="button"
            title="Export JSON"
          >
            Export
          </button>
        </div>

        <div className="studio-canvas-shell">
          <div id="studio-game" />
        </div>

        <aside className="studio-panel" aria-label="Map designer controls">
          <section className="studio-panel__section">
            <h2>Active Layer</h2>
            <label className="studio-layer-select">
              Numeric slot
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
            <p className="studio-note">
              Plain is always the base. Paint replaces terrain only inside this
              numeric layer.
            </p>
          </section>

          <section className="studio-panel__section">
            <h2>Terrain Palette</h2>
            <div className="studio-terrain-grid">
              {allTerrainAssets
                .filter((asset) => asset.id !== "uniswap-plain")
                .map((asset) => (
                  <button
                    className="studio-terrain-button"
                    data-active={selectedTerrain === asset.id ? "" : undefined}
                    key={asset.id}
                    onClick={() =>
                      sceneRef.current?.setSelectedTerrain(
                        asset.id as TerrainVisualAssetId
                      )
                    }
                    type="button"
                  >
                    <span
                      className={`studio-swatch ${getSwatchClass(asset.id)}`}
                    />
                    <span>{asset.label ?? terrainLabel(asset.id)}</span>
                  </button>
                ))}
            </div>
          </section>

          <section className="studio-panel__section">
            <h2>Brush</h2>
            <div className="studio-segmented" data-control="brush">
              {[1, 3, 5].map((size) => (
                <button
                  data-active={brushSize === size ? "" : undefined}
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

          <section className="studio-panel__section">
            <h2>World Size</h2>
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
                    ? "Resized map."
                    : "Use a width and height from 5 to 200."
                );
              }}
              type="button"
            >
              Resize Map
            </button>
          </section>

          <section className="studio-panel__section">
            <h2>Layer Actions</h2>
            <div className="studio-command-grid">
              <button
                onClick={() => sceneRef.current?.fillActiveLayer()}
                type="button"
              >
                Fill Layer
              </button>
              <button
                onClick={() => sceneRef.current?.clearActiveLayer()}
                type="button"
              >
                Clear Layer
              </button>
            </div>
          </section>

          <section className="studio-panel__section">
            <h2>Files</h2>
            <div className="studio-command-grid">
              <button
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                Import JSON
              </button>
              <button onClick={() => void saveMap()} type="button">
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

          <section className="studio-panel__status" aria-live="polite">
            <p>{state ? `${state.width}x${state.height} world` : "40x40"}</p>
            <p id="studio-tool-status">
              Layer {selectedLayer} · {terrainLabel(selectedTerrain)} ·{" "}
              {paintMode} · {brushSize}x{brushSize} ·{" "}
              {state?.activeLayerCellCount ?? 0} cells
            </p>
            <p>{helpMessage}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
