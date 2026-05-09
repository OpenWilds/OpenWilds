import Phaser from "phaser";
import type { TerrainVisualAssetId } from "../assets/visual-assets";
import {
  STUDIO_HEIGHT,
  STUDIO_LAYER_OPTIONS,
  STUDIO_TERRAIN_OPTIONS,
  STUDIO_WIDTH,
  StudioScene,
  terrainLabel,
  validateStudioMap,
  type StudioMapExport,
  type StudioSceneState,
} from "./studio-scene";

export const bootStudio = (app: HTMLElement) => {
  app.innerHTML = `
    <section class="studio-shell">
      <header class="studio-header">
        <div>
          <p class="eyebrow">Open Wilds Studio</p>
          <h1>Map Designer</h1>
        </div>
        <a class="studio-link" href="/">Back to game</a>
      </header>
      <div class="studio-workspace">
        <aside class="studio-panel" aria-label="Map designer controls">
          <section class="studio-panel__section">
            <h2>Active Layer</h2>
            <label class="studio-layer-select">
              Numeric slot
              <select id="studio-layer-select">
                ${STUDIO_LAYER_OPTIONS.map(
                  (layer) => `<option value="${layer}">Layer ${layer}</option>`
                ).join("")}
              </select>
            </label>
            <p class="studio-note">Plain is always the base. Paint replaces terrain only inside this numeric layer; different layers stack.</p>
          </section>

          <section class="studio-panel__section">
            <h2>Terrain</h2>
            <div class="studio-terrain-grid">
              ${STUDIO_TERRAIN_OPTIONS.map(
                (terrainId) => `
                  <button class="studio-terrain-button" data-terrain="${terrainId}" type="button">
                    <span class="studio-swatch studio-swatch--${terrainId.replace(
                      "uniswap-",
                      ""
                    )}"></span>
                    ${terrainLabel(terrainId)}
                  </button>
                `
              ).join("")}
            </div>
          </section>

          <section class="studio-panel__section">
            <h2>Brush</h2>
            <div class="studio-segmented" data-control="brush">
              <button data-brush="1" type="button">1x1</button>
              <button data-brush="3" type="button">3x3</button>
              <button data-brush="5" type="button">5x5</button>
            </div>
            <div class="studio-segmented" data-control="mode">
              <button data-mode="paint" type="button">Paint</button>
              <button data-mode="erase" type="button">Erase</button>
            </div>
            <label class="studio-toggle">
              <input id="studio-grid-toggle" type="checkbox" checked />
              Show grid
            </label>
          </section>

          <section class="studio-panel__section">
            <h2>World Size</h2>
            <div class="studio-size-row">
              <label>
                Width
                <input id="studio-width-input" min="5" max="200" type="number" value="40" />
              </label>
              <label>
                Height
                <input id="studio-height-input" min="5" max="200" type="number" value="40" />
              </label>
            </div>
            <button id="studio-resize-button" class="studio-command" type="button">Resize Map</button>
          </section>

          <section class="studio-panel__section">
            <h2>Layer Actions</h2>
            <div class="studio-command-grid">
              <button id="studio-fill-button" type="button">Fill Layer</button>
              <button id="studio-clear-button" type="button">Clear Layer</button>
            </div>
          </section>

          <section class="studio-panel__section">
            <h2>Files</h2>
            <div class="studio-command-grid">
              <button id="studio-export-button" type="button">Export JSON</button>
              <button id="studio-import-button" type="button">Import JSON</button>
            </div>
          </section>

          <section class="studio-panel__status" aria-live="polite">
            <p id="studio-map-status">40x40</p>
            <p id="studio-tool-status">Grass · Paint · 1x1</p>
            <p id="studio-help-status">Paint stacks layers. Erase removes selected layer. Plain clears a tile to base.</p>
          </section>
        </aside>

        <div id="studio-game"></div>
      </div>
      <input id="studio-import-input" type="file" accept="application/json,.json" hidden />
    </section>
  `;

  const importInput = app.querySelector<HTMLInputElement>(
    "#studio-import-input"
  );
  let scene: StudioScene | null = null;
  const sceneState: { current: StudioSceneState | null } = { current: null };
  const syncControls = (state: StudioSceneState) => {
    sceneState.current = state;
    syncStudioControls(app, state);
  };

  scene = new StudioScene({
    onStateChange: syncControls,
  });

  bindStudioControls(app, {
    getScene: () => scene,
    getState: () => sceneState.current,
    requestImport: () => importInput?.click(),
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";

    if (!file || !scene) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      validateStudioMap(parsed);
      scene.importMap(parsed);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import failed.");
    }
  });

  return new Phaser.Game({
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
};

type StudioControlBindings = {
  getScene: () => StudioScene | null;
  getState: () => StudioSceneState | null;
  requestImport: () => void;
};

const bindStudioControls = (
  app: HTMLElement,
  bindings: StudioControlBindings
) => {
  app
    .querySelectorAll<HTMLButtonElement>("[data-terrain]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        bindings
          .getScene()
          ?.setSelectedTerrain(button.dataset.terrain as TerrainVisualAssetId);
      });
    });

  app
    .querySelector<HTMLSelectElement>("#studio-layer-select")
    ?.addEventListener("change", (event) => {
      bindings
        .getScene()
        ?.setSelectedLayer(
          Number((event.currentTarget as HTMLSelectElement).value)
        );
    });

  app.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((button) => {
    button.addEventListener("click", () => {
      bindings.getScene()?.setBrushSize(Number(button.dataset.brush));
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode === "paint" || mode === "erase") {
        bindings.getScene()?.setPaintMode(mode);
      }
    });
  });

  app
    .querySelector<HTMLInputElement>("#studio-grid-toggle")
    ?.addEventListener("change", (event) => {
      bindings
        .getScene()
        ?.setGridVisible((event.currentTarget as HTMLInputElement).checked);
    });

  app
    .querySelector<HTMLButtonElement>("#studio-resize-button")
    ?.addEventListener("click", () => {
      const width = Number(
        app.querySelector<HTMLInputElement>("#studio-width-input")?.value
      );
      const height = Number(
        app.querySelector<HTMLInputElement>("#studio-height-input")?.value
      );
      const resized = bindings.getScene()?.resizeMap(width, height) ?? false;

      if (!resized) {
        window.alert("Use a width and height from 5 to 200.");
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-fill-button")
    ?.addEventListener("click", () => bindings.getScene()?.fillActiveLayer());

  app
    .querySelector<HTMLButtonElement>("#studio-clear-button")
    ?.addEventListener("click", () => bindings.getScene()?.clearActiveLayer());

  app
    .querySelector<HTMLButtonElement>("#studio-export-button")
    ?.addEventListener("click", () => {
      const scene = bindings.getScene();
      if (scene) {
        downloadStudioMap(scene.getExport());
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-import-button")
    ?.addEventListener("click", () => bindings.requestImport());
};

const syncStudioControls = (app: HTMLElement, state: StudioSceneState) => {
  app
    .querySelectorAll<HTMLButtonElement>("[data-terrain]")
    .forEach((button) => {
      button.toggleAttribute(
        "data-active",
        button.dataset.terrain === state.selectedTerrain
      );
    });
  app.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((button) => {
    button.toggleAttribute(
      "data-active",
      Number(button.dataset.brush) === state.brushSize
    );
  });
  app.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.toggleAttribute(
      "data-active",
      button.dataset.mode === state.paintMode
    );
  });

  const widthInput = app.querySelector<HTMLInputElement>("#studio-width-input");
  const heightInput = app.querySelector<HTMLInputElement>(
    "#studio-height-input"
  );
  const gridToggle = app.querySelector<HTMLInputElement>("#studio-grid-toggle");
  const layerSelect = app.querySelector<HTMLSelectElement>(
    "#studio-layer-select"
  );
  const mapStatus = app.querySelector<HTMLElement>("#studio-map-status");
  const toolStatus = app.querySelector<HTMLElement>("#studio-tool-status");
  const helpStatus = app.querySelector<HTMLElement>("#studio-help-status");

  if (widthInput && document.activeElement !== widthInput) {
    widthInput.value = String(state.width);
  }
  if (heightInput && document.activeElement !== heightInput) {
    heightInput.value = String(state.height);
  }
  if (gridToggle) {
    gridToggle.checked = state.showGrid;
  }
  if (layerSelect && document.activeElement !== layerSelect) {
    layerSelect.value = String(state.selectedLayer);
  }
  if (mapStatus) {
    mapStatus.textContent = `${state.width}x${state.height} world`;
  }
  if (toolStatus) {
    toolStatus.textContent = `Layer ${state.selectedLayer} · ${terrainLabel(
      state.selectedTerrain
    )} · ${state.paintMode} · ${state.brushSize}x${state.brushSize} · ${
      state.activeLayerCellCount
    } cells`;
  }
  if (helpStatus) {
    helpStatus.textContent =
      state.message === DEFAULT_STUDIO_HELP
        ? LAYERED_STUDIO_HELP
        : state.message;
  }
};

const DEFAULT_STUDIO_HELP =
  "Drag to paint. Right/middle drag pans. Wheel zooms.";
const LAYERED_STUDIO_HELP =
  "Paint replaces terrain inside the active numeric layer. Erase clears that layer at the tile. Different layers stack.";

const downloadStudioMap = (map: StudioMapExport) => {
  const blob = new Blob([JSON.stringify(map, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `open-wilds-map-${map.width}x${map.height}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
