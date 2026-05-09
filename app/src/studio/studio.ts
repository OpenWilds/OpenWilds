import Phaser from "phaser";
import {
  BUILT_IN_TERRAIN_VISUAL_ASSET_IDS,
  TERRAIN_VISUAL_ASSETS,
  type TerrainVisualAsset,
  type TerrainVisualAssetId,
} from "../assets/visual-assets";
import {
  STUDIO_HEIGHT,
  STUDIO_LAYER_OPTIONS,
  STUDIO_WIDTH,
  StudioScene,
  terrainLabel,
  validateStudioMap,
  type StudioMapExport,
  type StudioSceneState,
} from "./studio-scene";
import {
  buildTerrainTexturePrompt,
  generateTerrainAsset,
  normalizeTerrainId,
} from "./terrain-generator";

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
              ${renderTerrainButtons(getInitialTerrainAssets())}
            </div>
          </section>

          <section class="studio-panel__section">
            <h2>Terrain Workshop</h2>
            <div class="studio-generator-fields">
              <label>
                Name
                <input id="studio-terrain-name" type="text" value="Moonlit Moss" />
              </label>
              <label>
                Terrain ID
                <input id="studio-terrain-id" type="text" value="moonlit-moss" />
              </label>
              <label>
                Material
                <input id="studio-terrain-material" type="text" value="moonlit moss meadow" />
              </label>
              <label>
                Texture
                <textarea id="studio-terrain-texture" rows="3">soft dark green moss with tiny blue-white flower specks and pale dew highlights</textarea>
              </label>
              <label>
                Style
                <textarea id="studio-terrain-style" rows="3">cozy hand-painted 2D game terrain, top-down, readable at small tile size, no logos, no text</textarea>
              </label>
              <label>
                Source texture PNG
                <input id="studio-terrain-source" type="file" accept="image/png,image/jpeg,image/webp" />
              </label>
            </div>
            <div class="studio-command-grid">
              <button id="studio-generate-terrain-button" type="button">Build Terrain</button>
              <button id="studio-copy-prompt-button" type="button">Copy Prompt</button>
            </div>
            <p class="studio-note">Use the prompt to make a square seamless texture, then load that PNG here. The studio turns it into a 47-tile autotile set.</p>
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

  const importInput = app.querySelector<HTMLInputElement>("#studio-import-input");
  const terrainAssets = getInitialTerrainAssets();
  let scene: StudioScene | null = null;
  let generatedTerrains: TerrainVisualAsset[] = [];
  const sceneState: { current: StudioSceneState | null } = { current: null };
  const syncControls = (state: StudioSceneState) => {
    sceneState.current = state;
    syncStudioControls(app, state);
  };

  scene = new StudioScene({
    terrainAssets,
    onStateChange: syncControls,
  });

  bindStudioControls(app, {
    getScene: () => scene,
    getState: () => sceneState.current,
    getGeneratedTerrains: () => generatedTerrains,
    setGeneratedTerrains: (assets) => {
      generatedTerrains = assets;
      renderTerrainPalette(app, [...terrainAssets, ...generatedTerrains]);
      bindTerrainPalette(app, { getScene: () => scene });
      if (sceneState.current) {
        syncStudioControls(app, sceneState.current);
      }
    },
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
      generatedTerrains = upsertManyTerrainAssets(
        generatedTerrains,
        parsed.terrainAssets ?? []
      );
      renderTerrainPalette(app, [...terrainAssets, ...generatedTerrains]);
      bindTerrainPalette(app, { getScene: () => scene });
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

const getInitialTerrainAssets = (): TerrainVisualAsset[] =>
  BUILT_IN_TERRAIN_VISUAL_ASSET_IDS.map(
    (assetId) => TERRAIN_VISUAL_ASSETS[assetId]
  );

const renderTerrainButtons = (assets: TerrainVisualAsset[]) =>
  assets
    .filter((asset) => asset.id !== "uniswap-plain")
    .map(
      (asset) => `
        <button class="studio-terrain-button" data-terrain="${asset.id}" type="button">
          <span class="studio-swatch ${getSwatchClass(asset.id)}"></span>
          <span>${asset.label ?? terrainLabel(asset.id)}</span>
        </button>
      `
    )
    .join("");

const renderTerrainPalette = (
  app: HTMLElement,
  assets: TerrainVisualAsset[]
) => {
  const palette = app.querySelector<HTMLElement>(".studio-terrain-grid");

  if (!palette) {
    return;
  }

  palette.innerHTML = renderTerrainButtons(assets);
};

const getSwatchClass = (terrainId: string) => {
  if (terrainId.startsWith("uniswap-")) {
    return `studio-swatch--${terrainId.replace("uniswap-", "")}`;
  }

  return "studio-swatch--generated";
};

type StudioControlBindings = {
  getScene: () => StudioScene | null;
  getState: () => StudioSceneState | null;
  getGeneratedTerrains: () => TerrainVisualAsset[];
  setGeneratedTerrains: (assets: TerrainVisualAsset[]) => void;
  requestImport: () => void;
};

const bindStudioControls = (
  app: HTMLElement,
  bindings: StudioControlBindings
) => {
  bindTerrainPalette(app, bindings);

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

  app
    .querySelector<HTMLButtonElement>("#studio-copy-prompt-button")
    ?.addEventListener("click", async () => {
      try {
        const prompt = buildTerrainTexturePrompt(readTerrainGeneratorForm(app));
        await navigator.clipboard.writeText(prompt);
        updateGeneratorStatus(app, "Copied source texture prompt");
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Could not copy prompt."
        );
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-generate-terrain-button")
    ?.addEventListener("click", async () => {
      const source = app.querySelector<HTMLInputElement>(
        "#studio-terrain-source"
      )?.files?.[0];

      if (!source) {
        updateGeneratorStatus(app, "Choose a square source texture PNG first.");
        return;
      }

      try {
        updateGeneratorStatus(app, "Building autotile terrain...");
        const form = readTerrainGeneratorForm(app);
        const asset = await generateTerrainAsset({
          ...form,
          sourceTexture: source,
        });
        const nextTerrains = upsertTerrainAsset(
          bindings.getGeneratedTerrains(),
          asset
        );

        bindings.setGeneratedTerrains(nextTerrains);
        bindings.getScene()?.addTerrainAsset(asset);
        updateGeneratorStatus(app, `Built ${asset.label}`);
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Terrain generation failed."
        );
      }
    });
};

const bindTerrainPalette = (
  app: HTMLElement,
  bindings: Pick<StudioControlBindings, "getScene">
) => {
  app
    .querySelectorAll<HTMLButtonElement>("[data-terrain]")
    .forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        bindings
          .getScene()
          ?.setSelectedTerrain(button.dataset.terrain as TerrainVisualAssetId);
      });
    });
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

const readTerrainGeneratorForm = (app: HTMLElement) => {
  const value = (selector: string) =>
    app.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value ??
    "";
  const label = value("#studio-terrain-name").trim();
  const terrainId = normalizeTerrainId(value("#studio-terrain-id") || label);
  const material = value("#studio-terrain-material").trim() || label;
  const texturePrompt = value("#studio-terrain-texture").trim();
  const stylePrompt = value("#studio-terrain-style").trim();

  if (!texturePrompt || !stylePrompt) {
    throw new Error("Texture and style prompts are required.");
  }

  return {
    terrainId,
    label: label || terrainLabel(terrainId),
    material,
    texturePrompt,
    stylePrompt,
  };
};

const updateGeneratorStatus = (app: HTMLElement, message: string) => {
  const status = app.querySelector<HTMLElement>("#studio-help-status");

  if (status) {
    status.textContent = message;
  }
};

const upsertTerrainAsset = <TAsset extends TerrainVisualAsset>(
  assets: TAsset[],
  asset: TAsset
) => {
  const nextAssets = assets.filter(
    (existingAsset) => existingAsset.id !== asset.id
  );

  nextAssets.push(asset);
  return nextAssets;
};

const upsertManyTerrainAssets = (
  assets: TerrainVisualAsset[],
  nextAssets: TerrainVisualAsset[]
) =>
  nextAssets.reduce(
    (mergedAssets, asset) => upsertTerrainAsset(mergedAssets, asset),
    assets
  );

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
