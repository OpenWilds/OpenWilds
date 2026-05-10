import Phaser from "phaser";
import {
  BUILT_IN_TERRAIN_VISUAL_ASSET_IDS,
  TERRAIN_VISUAL_ASSETS,
  type TerrainVisualAsset,
  type TerrainVisualAssetId,
} from "../../assets/visual-assets";
import {
  STUDIO_HEIGHT,
  STUDIO_LAYER_OPTIONS,
  STUDIO_WIDTH,
  StudioScene,
  terrainLabel,
  validateStudioMap,
  type StudioMapExport,
  type StudioSceneState,
} from "../phaser/studio-scene";
import {
  dataUrlToPngBlob,
  generateSourceTexture,
  isConvexStudioConfigured,
  listStudioSourceTextures,
  listStudioTerrainAssets,
  registerGeneratedTerrainAsset,
  registerSourceTexture,
  saveStudioMapToConvex,
  type StudioSourceTexture,
} from "../convex/convex-studio";
import {
  buildTerrainTexturePrompt,
  generateTerrainAsset,
  normalizeTerrainId,
} from "../phaser/terrain-generator";

export const bootStudio = (app: HTMLElement) => {
  app.classList.add("studio-app");
  app.innerHTML = `
    <section class="studio-shell">
      <aside class="studio-sidebar" aria-label="Studio navigation">
        <div class="studio-brand">
          <div class="studio-brand__mark" aria-hidden="true">OW</div>
          <div>
            <p class="eyebrow">Open Wilds</p>
            <h1>Studio</h1>
          </div>
        </div>
        <nav class="studio-nav" aria-label="Studio sections">
          <p>Studio Tools</p>
          <button data-studio-route="dashboard" type="button">
            <span class="studio-nav__icon" aria-hidden="true">OV</span>
            <span>Overview</span>
          </button>
          <button data-studio-route="textures" type="button">
            <span class="studio-nav__icon" aria-hidden="true">TX</span>
            <span>Texture Studio</span>
          </button>
          <button data-studio-route="map" type="button">
            <span class="studio-nav__icon" aria-hidden="true">MP</span>
            <span>Map Editor</span>
          </button>
          <button data-studio-route="assets" type="button">
            <span class="studio-nav__icon" aria-hidden="true">AS</span>
            <span>Asset Library</span>
          </button>
        </nav>
        <div class="studio-user-card">
          <div class="studio-user-card__avatar" aria-hidden="true">A</div>
          <div>
            <strong>Creator Admin</strong>
            <span>Local Studio</span>
          </div>
        </div>
        <a class="studio-link" href="/">Back to game</a>
      </aside>

      <main class="studio-main">
        <header class="studio-topbar">
          <div class="studio-topbar__title">
            <span class="studio-topbar__icon" id="studio-route-icon" aria-hidden="true">OV</span>
            <div>
              <p class="eyebrow" id="studio-route-kicker">World Building</p>
              <h2 id="studio-route-title">Overview</h2>
            </div>
          </div>
          <div class="studio-topbar__actions">
            <label class="studio-search">
              <span aria-hidden="true"></span>
              <input type="search" placeholder="Search assets, maps..." />
            </label>
            <div class="studio-topbar__meta">
              <span>Convex Library</span>
              <strong id="studio-library-status">Syncing</strong>
            </div>
            <a class="studio-playtest" href="/">Playtest</a>
          </div>
        </header>

        <section class="studio-page" data-studio-page="dashboard">
          <div class="studio-dashboard">
            <div class="studio-stats-grid">
              <article class="studio-stat">
                <span>Total Terrain Assets</span>
                <strong id="studio-dashboard-terrain-count">6</strong>
                <small>Built-in and generated</small>
              </article>
              <article class="studio-stat">
                <span>Source Textures</span>
                <strong id="studio-dashboard-texture-count">0</strong>
                <small>Loaded from Convex</small>
              </article>
              <article class="studio-stat">
                <span>Active Map</span>
                <strong id="studio-dashboard-map-size">40x40</strong>
                <small>Layered terrain grid</small>
              </article>
            </div>

            <div class="studio-dashboard-grid">
              <section class="studio-feature-panel">
                <div>
                  <p class="eyebrow">AI Generation</p>
                  <h2>Generate Seamless Terrain Textures</h2>
                  <p>Create source textures, review the result, then build map-ready autotile terrain for the palette.</p>
                </div>
                <button class="studio-primary-action" data-studio-route="textures" type="button">Open Texture Studio</button>
              </section>

              <section class="studio-recent-panel">
                <div class="studio-section-heading">
                  <p class="eyebrow">Recent Work</p>
                  <h2>Studio Shortcuts</h2>
                </div>
                <button class="studio-recent-item" data-studio-route="map" type="button">
                  <span class="studio-recent-item__icon" aria-hidden="true">MP</span>
                  <span>
                    <strong>Open map editor</strong>
                    <small>Paint layers and export JSON</small>
                  </span>
                </button>
                <button class="studio-recent-item" data-studio-route="textures" type="button">
                  <span class="studio-recent-item__icon" aria-hidden="true">TX</span>
                  <span>
                    <strong>Generate terrain source</strong>
                    <small>Create a reusable texture</small>
                  </span>
                </button>
              </section>
            </div>
          </div>
        </section>

        <section class="studio-page" data-studio-page="map" hidden>
          <div class="studio-workspace">
            <div class="studio-editor-toolbar" aria-label="Map tools">
              <button data-mode="paint" type="button" title="Paint">Paint</button>
              <button data-mode="erase" type="button" title="Erase">Erase</button>
              <button id="studio-export-button" type="button" title="Export JSON">Export</button>
            </div>

            <div class="studio-canvas-shell">
              <div id="studio-game"></div>
            </div>

            <aside class="studio-panel" aria-label="Map designer controls">
              <section class="studio-panel__section">
                <h2>Active Layer</h2>
                <label class="studio-layer-select">
                  Numeric slot
                  <select id="studio-layer-select">
                    ${STUDIO_LAYER_OPTIONS.map(
                      (layer) =>
                        `<option value="${layer}">Layer ${layer}</option>`
                    ).join("")}
                  </select>
                </label>
                <p class="studio-note">Plain is always the base. Paint replaces terrain only inside this numeric layer.</p>
              </section>

              <section class="studio-panel__section">
                <h2>Terrain Palette</h2>
                <div class="studio-terrain-grid">
                  ${renderTerrainButtons(getInitialTerrainAssets())}
                </div>
              </section>

              <section class="studio-panel__section">
                <h2>Brush</h2>
                <div class="studio-segmented" data-control="brush">
                  <button data-brush="1" type="button">1x1</button>
                  <button data-brush="3" type="button">3x3</button>
                  <button data-brush="5" type="button">5x5</button>
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
                  <button id="studio-import-button" type="button">Import JSON</button>
                  <button id="studio-save-cloud-button" type="button">Save Cloud</button>
                </div>
              </section>

              <section class="studio-panel__status" aria-live="polite">
                <p id="studio-map-status">40x40</p>
                <p id="studio-tool-status">Grass · Paint · 1x1</p>
                <p id="studio-help-status">Paint stacks layers. Erase removes selected layer. Plain clears a tile to base.</p>
              </section>
            </aside>
          </div>
        </section>

      <section class="studio-page studio-page--textures" data-studio-page="textures" hidden>
        <div class="studio-workshop">
          <section class="studio-workshop__form">
            <div class="studio-section-heading">
              <p class="eyebrow">Texture Workshop</p>
              <h2>Source Texture Generator</h2>
            </div>
            <div class="studio-generator-fields studio-generator-fields--workshop">
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
                Texture Brief
                <textarea id="studio-terrain-texture" rows="5">soft dark green moss with tiny blue-white flower specks and pale dew highlights</textarea>
              </label>
              <label>
                Style Direction
                <textarea id="studio-terrain-style" rows="5">cozy hand-painted 2D game terrain, top-down, readable at small tile size, no logos, no text</textarea>
              </label>
              <label>
                Source texture PNG
                <input id="studio-terrain-source" type="file" accept="image/png,image/jpeg,image/webp" />
              </label>
            </div>
            <div class="studio-command-grid">
              <button id="studio-generate-texture-button" type="button">Generate Texture</button>
              <button id="studio-copy-prompt-button" type="button">Copy Prompt</button>
            </div>
            <button id="studio-generate-terrain-button" class="studio-command" type="button">Build Terrain From Texture</button>
            <div
              id="studio-generator-status"
              class="studio-generator-status"
              data-state="idle"
              aria-live="polite"
            >
              Ready to generate a source texture.
            </div>
          </section>

          <section class="studio-workshop__preview">
            <div class="studio-section-heading">
              <p class="eyebrow">Review</p>
              <h2>Selected Source</h2>
            </div>
            <div class="studio-texture-preview" id="studio-texture-preview" hidden>
              <img id="studio-texture-preview-image" alt="Generated terrain source texture preview" />
            </div>
            <div class="studio-empty-preview">
              <span aria-hidden="true"></span>
              <strong>No source selected</strong>
              <p>Generate or choose a source texture to preview it here.</p>
            </div>
            <p class="studio-note">Use generated or uploaded source textures here, then build a 47-tile terrain set for the map palette.</p>
          </section>

          <section class="studio-workshop__library">
            <div class="studio-section-heading">
              <p class="eyebrow">Library</p>
              <h2>Recent Textures</h2>
            </div>
            <div class="studio-source-textures" id="studio-source-textures" hidden>
              <div id="studio-source-texture-list" class="studio-source-texture-list"></div>
            </div>
            <div class="studio-library-group">
              <p>Available Terrain</p>
              <div id="studio-terrain-asset-list" class="studio-source-texture-list"></div>
            </div>
          </section>
        </div>
      </section>

      <section class="studio-page" data-studio-page="assets" hidden>
        <div class="studio-empty-module">
          <span aria-hidden="true">AS</span>
          <h2>Asset Library</h2>
          <p>Generated terrain and source textures are available from the Texture Studio and Map Editor today.</p>
          <button class="studio-primary-action" data-studio-route="textures" type="button">Open Texture Studio</button>
        </div>
      </section>
      <input id="studio-import-input" type="file" accept="application/json,.json" hidden />
      </main>
    </section>
  `;

  const importInput = app.querySelector<HTMLInputElement>(
    "#studio-import-input"
  );
  const terrainAssets = getInitialTerrainAssets();
  let scene: StudioScene | null = null;
  let generatedTerrains: TerrainVisualAsset[] = [];
  let generatedSourceTexture: StudioSourceTexture | null = null;
  let sourceTextures: StudioSourceTexture[] = [];
  const sceneState: { current: StudioSceneState | null } = { current: null };
  const setGeneratedTerrains = (assets: TerrainVisualAsset[]) => {
    generatedTerrains = assets;
    renderTerrainPalette(app, [...terrainAssets, ...generatedTerrains]);
    renderTerrainAssetLibrary(app, [...terrainAssets, ...generatedTerrains]);
    updateStudioDashboardCounts(
      app,
      terrainAssets.length + generatedTerrains.length
    );
    bindTerrainPalette(app, { getScene: () => scene });
    if (sceneState.current) {
      syncStudioControls(app, sceneState.current);
    }
  };
  const syncControls = (state: StudioSceneState) => {
    sceneState.current = state;
    syncStudioControls(app, state);
  };
  const setSourceTextures = (textures: StudioSourceTexture[]) => {
    sourceTextures = textures;
    updateStudioDashboardCounts(app, undefined, sourceTextures.length);
    renderSourceTextureList(
      app,
      sourceTextures,
      generatedSourceTexture?.textureId
    );
    bindSourceTextureList(app, {
      getSourceTextures: () => sourceTextures,
      setGeneratedSourceTexture: (texture) => {
        generatedSourceTexture = texture;
        renderSourceTexturePreview(app, texture?.url ?? null);
        renderSourceTextureList(app, sourceTextures, texture?.textureId);
      },
    });
  };

  renderTerrainAssetLibrary(app, terrainAssets);

  scene = new StudioScene({
    terrainAssets,
    onStateChange: syncControls,
    onReady: () => {
      void hydrateStudioFromConvex(app, {
        getScene: () => scene,
        getGeneratedTerrains: () => generatedTerrains,
        setGeneratedTerrains,
        getGeneratedSourceTexture: () => generatedSourceTexture,
        setGeneratedSourceTexture: (texture) => {
          generatedSourceTexture = texture;
          renderSourceTexturePreview(app, texture?.url ?? null);
          renderSourceTextureList(app, sourceTextures, texture?.textureId);
        },
        getSourceTextures: () => sourceTextures,
        setSourceTextures,
      });
    },
  });

  bindStudioControls(app, {
    getScene: () => scene,
    getState: () => sceneState.current,
    getGeneratedTerrains: () => generatedTerrains,
    setGeneratedTerrains,
    getGeneratedSourceTexture: () => generatedSourceTexture,
    setGeneratedSourceTexture: (texture) => {
      generatedSourceTexture = texture;
      renderSourceTexturePreview(app, texture?.url ?? null);
      renderSourceTextureList(app, sourceTextures, texture?.textureId);
    },
    getSourceTextures: () => sourceTextures,
    setSourceTextures,
    requestImport: () => importInput?.click(),
  });
  bindStudioNavigation(app);

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";

    if (!file || !scene) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      validateStudioMap(parsed);
      setGeneratedTerrains(
        upsertManyTerrainAssets(generatedTerrains, parsed.terrainAssets ?? [])
      );
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
        <button class="studio-terrain-button" data-terrain="${
          asset.id
        }" type="button">
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

const renderSourceTexturePreview = (app: HTMLElement, url: string | null) => {
  const preview = app.querySelector<HTMLElement>("#studio-texture-preview");
  const image = app.querySelector<HTMLImageElement>(
    "#studio-texture-preview-image"
  );

  if (!preview || !image) {
    return;
  }

  if (!url) {
    preview.hidden = true;
    image.removeAttribute("src");
    return;
  }

  image.src = url;
  preview.hidden = false;
};

const renderSourceTextureList = (
  app: HTMLElement,
  textures: StudioSourceTexture[],
  selectedTextureId?: string
) => {
  const shell = app.querySelector<HTMLElement>("#studio-source-textures");
  const list = app.querySelector<HTMLElement>("#studio-source-texture-list");

  if (!shell || !list) {
    return;
  }

  if (textures.length === 0) {
    shell.hidden = true;
    list.innerHTML = "";
    return;
  }

  shell.hidden = false;
  list.innerHTML = textures
    .slice(0, 8)
    .map(
      (texture) => `
        <button
          class="studio-source-texture-button"
          data-source-texture="${escapeHtml(texture.textureId)}"
          ${texture.textureId === selectedTextureId ? "data-active" : ""}
          type="button"
        >
          <img src="${escapeHtml(texture.url ?? "")}" alt="" />
          <span>${escapeHtml(texture.label)}${
        texture.status === "draft" ? " · draft" : ""
      }</span>
        </button>
      `
    )
    .join("");
};

const renderTerrainAssetLibrary = (
  app: HTMLElement,
  assets: TerrainVisualAsset[]
) => {
  const list = app.querySelector<HTMLElement>("#studio-terrain-asset-list");

  if (!list) {
    return;
  }

  list.innerHTML = assets
    .filter((asset) => asset.id !== "uniswap-plain")
    .slice(0, 12)
    .map(
      (asset) => `
        <button
          class="studio-source-texture-button studio-terrain-asset-card"
          data-terrain="${escapeHtml(asset.id)}"
          type="button"
        >
          <img src="${escapeHtml(asset.centerVariantsUrl)}" alt="" />
          <span>${escapeHtml(asset.label ?? terrainLabel(asset.id))}</span>
        </button>
      `
    )
    .join("");
};

const setGeneratorBusy = (app: HTMLElement, isBusy: boolean) => {
  app
    .querySelectorAll<HTMLButtonElement>(
      "#studio-generate-texture-button, #studio-copy-prompt-button, #studio-generate-terrain-button"
    )
    .forEach((button) => {
      button.disabled = isBusy;
    });
};

const bindStudioNavigation = (app: HTMLElement) => {
  const setRoute = (route: string) => {
    const routeTitle = app.querySelector<HTMLElement>("#studio-route-title");
    const routeKicker = app.querySelector<HTMLElement>("#studio-route-kicker");
    const routeIcon = app.querySelector<HTMLElement>("#studio-route-icon");
    const routeLabels: Record<
      string,
      { icon: string; kicker: string; title: string }
    > = {
      dashboard: {
        icon: "OV",
        kicker: "World Building",
        title: "Overview",
      },
      map: {
        icon: "MP",
        kicker: "World Building",
        title: "Map Editor",
      },
      textures: {
        icon: "TX",
        kicker: "Asset Pipeline",
        title: "Texture Studio",
      },
      assets: {
        icon: "AS",
        kicker: "Library",
        title: "Asset Library",
      },
    };
    const label = routeLabels[route] ?? routeLabels.dashboard;

    if (routeTitle) {
      routeTitle.textContent = label.title;
    }
    if (routeKicker) {
      routeKicker.textContent = label.kicker;
    }
    if (routeIcon) {
      routeIcon.textContent = label.icon;
    }

    app.querySelectorAll<HTMLElement>("[data-studio-page]").forEach((page) => {
      page.hidden = page.dataset.studioPage !== route;
    });
    app
      .querySelectorAll<HTMLButtonElement>("[data-studio-route]")
      .forEach((button) => {
        button.toggleAttribute(
          "data-active",
          button.dataset.studioRoute === route
        );
      });
  };

  app
    .querySelectorAll<HTMLButtonElement>("[data-studio-route]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const route = button.dataset.studioRoute ?? "map";
        window.history.replaceState(null, "", `#${route}`);
        setRoute(route);
      });
    });

  const initialRoute = window.location.hash.replace("#", "") || "dashboard";
  setRoute(routeLabels[initialRoute] ? initialRoute : "dashboard");
};

const updateStudioDashboardCounts = (
  app: HTMLElement,
  terrainCount?: number,
  textureCount?: number,
  mapSize?: string
) => {
  const terrainCountElement = app.querySelector<HTMLElement>(
    "#studio-dashboard-terrain-count"
  );
  const textureCountElement = app.querySelector<HTMLElement>(
    "#studio-dashboard-texture-count"
  );
  const mapSizeElement = app.querySelector<HTMLElement>(
    "#studio-dashboard-map-size"
  );

  if (terrainCountElement && terrainCount !== undefined) {
    terrainCountElement.textContent = String(terrainCount);
  }
  if (textureCountElement && textureCount !== undefined) {
    textureCountElement.textContent = String(textureCount);
  }
  if (mapSizeElement && mapSize) {
    mapSizeElement.textContent = mapSize;
  }
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
  getGeneratedSourceTexture: () => StudioSourceTexture | null;
  setGeneratedSourceTexture: (texture: StudioSourceTexture | null) => void;
  getSourceTextures: () => StudioSourceTexture[];
  setSourceTextures: (textures: StudioSourceTexture[]) => void;
  requestImport: () => void;
};

type StudioTerrainBinding = Pick<
  StudioControlBindings,
  | "getScene"
  | "getGeneratedTerrains"
  | "setGeneratedTerrains"
  | "getGeneratedSourceTexture"
  | "setGeneratedSourceTexture"
  | "getSourceTextures"
  | "setSourceTextures"
>;

const hydrateStudioFromConvex = async (
  app: HTMLElement,
  bindings: StudioTerrainBinding
) => {
  const libraryStatus = app.querySelector<HTMLElement>(
    "#studio-library-status"
  );

  if (!isConvexStudioConfigured()) {
    if (libraryStatus) {
      libraryStatus.textContent = "Offline";
    }
    updateGeneratorStatus(
      app,
      "Convex is not configured. Set VITE_CONVEX_URL to save shared terrain.",
      "error"
    );
    return;
  }

  try {
    if (libraryStatus) {
      libraryStatus.textContent = "Loading";
    }
    updateGeneratorStatus(
      app,
      "Loading Studio library from Convex...",
      "loading"
    );
    const [assets, textures] = await Promise.all([
      listStudioTerrainAssets(),
      listStudioSourceTextures(),
    ]);
    const nextTerrains = upsertManyTerrainAssets(
      bindings.getGeneratedTerrains(),
      assets
    );
    const nextTextures = upsertManySourceTextures(
      bindings.getSourceTextures(),
      textures
    );

    bindings.setGeneratedTerrains(nextTerrains);
    bindings.setSourceTextures(nextTextures);
    for (const asset of assets) {
      bindings.getScene()?.addTerrainAsset(asset, false);
    }

    if (!bindings.getGeneratedSourceTexture() && nextTextures[0]) {
      bindings.setGeneratedSourceTexture(nextTextures[0]);
      fillTerrainGeneratorForm(app, nextTextures[0]);
    }

    updateGeneratorStatus(
      app,
      `Loaded ${assets.length} terrain assets and ${textures.length} source textures from Convex`,
      "success"
    );
    if (libraryStatus) {
      libraryStatus.textContent = `${assets.length} terrain / ${textures.length} textures`;
    }
  } catch (error) {
    if (libraryStatus) {
      libraryStatus.textContent = "Error";
    }
    updateGeneratorStatus(
      app,
      error instanceof Error
        ? error.message
        : "Could not load Convex terrain library.",
      "error"
    );
  }
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
    .querySelector<HTMLButtonElement>("#studio-save-cloud-button")
    ?.addEventListener("click", async () => {
      const scene = bindings.getScene();

      if (!scene) {
        return;
      }

      try {
        const map = scene.getExport();
        await saveStudioMapToConvex(
          `Open Wilds ${map.width}x${map.height}`,
          map
        );
        updateGeneratorStatus(app, "Saved map to Convex", "success");
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Could not save map.",
          "error"
        );
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-copy-prompt-button")
    ?.addEventListener("click", async () => {
      try {
        const prompt = buildTerrainTexturePrompt(readTerrainGeneratorForm(app));
        await navigator.clipboard.writeText(prompt);
        updateGeneratorStatus(app, "Copied source texture prompt", "success");
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Could not copy prompt.",
          "error"
        );
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-generate-texture-button")
    ?.addEventListener("click", async () => {
      try {
        const form = readTerrainGeneratorForm(app);
        setGeneratorBusy(app, true);
        updateGeneratorStatus(
          app,
          `Generating ${form.label} source texture with Convex...`,
          "loading"
        );
        const texture = await generateSourceTexture(form);

        bindings.setSourceTextures(
          upsertSourceTexture(bindings.getSourceTextures(), texture)
        );
        bindings.setGeneratedSourceTexture(texture);
        updateGeneratorStatus(
          app,
          `Generated ${form.label} source texture. Review the preview, then build terrain.`,
          "success"
        );
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Texture generation failed.",
          "error"
        );
      } finally {
        setGeneratorBusy(app, false);
      }
    });

  app
    .querySelector<HTMLButtonElement>("#studio-generate-terrain-button")
    ?.addEventListener("click", async () => {
      const source = app.querySelector<HTMLInputElement>(
        "#studio-terrain-source"
      )?.files?.[0];
      const generatedTexture = bindings.getGeneratedSourceTexture();

      if (!source && !generatedTexture?.url) {
        updateGeneratorStatus(
          app,
          "Generate or choose a source texture first.",
          "error"
        );
        return;
      }

      try {
        setGeneratorBusy(app, true);
        const form = readTerrainGeneratorForm(app);
        let sourceTextureId = generatedTexture?.textureId;
        let sourceTexture: File | Blob = source as File;

        if (source) {
          updateGeneratorStatus(
            app,
            "Uploading source texture to Convex...",
            "loading"
          );
          sourceTextureId = await registerSourceTexture({
            ...form,
            file: source,
          });
          bindings.setGeneratedSourceTexture(null);
        } else if (generatedTexture?.url) {
          updateGeneratorStatus(
            app,
            "Loading generated source texture...",
            "loading"
          );
          const response = await fetch(generatedTexture.url);

          if (!response.ok) {
            throw new Error("Could not load generated source texture.");
          }

          sourceTexture = await response.blob();
        }

        updateGeneratorStatus(app, "Building autotile terrain...", "loading");
        const asset = await generateTerrainAsset({
          ...form,
          sourceTexture,
        });
        updateGeneratorStatus(
          app,
          "Uploading generated terrain to Convex...",
          "loading"
        );
        await registerGeneratedTerrainAsset({
          ...form,
          sourceTextureId,
          atlasBlob: await dataUrlToPngBlob(asset.atlasUrl),
          centerVariantsBlob: await dataUrlToPngBlob(asset.centerVariantsUrl),
        });

        const convexAssets = await listStudioTerrainAssets();
        const storedAsset =
          convexAssets.find((terrain) => terrain.id === asset.id) ?? asset;
        const nextTerrains = upsertTerrainAsset(
          bindings.getGeneratedTerrains(),
          storedAsset
        );
        const nextSourceTextures = await listStudioSourceTextures();

        bindings.setGeneratedTerrains(nextTerrains);
        bindings.setSourceTextures(nextSourceTextures);
        bindings.getScene()?.addTerrainAsset(storedAsset);
        updateGeneratorStatus(
          app,
          `Saved ${storedAsset.label} to Convex and added it to the palette.`,
          "success"
        );
      } catch (error) {
        updateGeneratorStatus(
          app,
          error instanceof Error ? error.message : "Terrain generation failed.",
          "error"
        );
      } finally {
        setGeneratorBusy(app, false);
      }
    });
};

const bindSourceTextureList = (
  app: HTMLElement,
  bindings: Pick<
    StudioControlBindings,
    "getSourceTextures" | "setGeneratedSourceTexture"
  >
) => {
  app
    .querySelectorAll<HTMLButtonElement>("[data-source-texture]")
    .forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        const textureId = button.dataset.sourceTexture;
        const texture = bindings
          .getSourceTextures()
          .find((texture) => texture.textureId === textureId);

        if (!texture) {
          return;
        }

        bindings.setGeneratedSourceTexture(texture);
        fillTerrainGeneratorForm(app, texture);
        updateGeneratorStatus(
          app,
          `Selected ${texture.label} source texture. Build terrain when ready.`,
          "success"
        );
      });
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
  updateStudioDashboardCounts(
    app,
    undefined,
    undefined,
    `${state.width}x${state.height}`
  );
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
    app.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
      ?.value ?? "";
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

const fillTerrainGeneratorForm = (
  app: HTMLElement,
  texture: StudioSourceTexture
) => {
  const setValue = (selector: string, value: string) => {
    const input = app.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      selector
    );

    if (input) {
      input.value = value;
    }
  };

  setValue("#studio-terrain-name", texture.label);
  setValue("#studio-terrain-id", texture.terrainId);
  setValue("#studio-terrain-material", texture.material);
  setValue("#studio-terrain-texture", texture.texturePrompt);
  setValue("#studio-terrain-style", texture.stylePrompt);
};

type GeneratorStatusState = "idle" | "loading" | "success" | "error";

const updateGeneratorStatus = (
  app: HTMLElement,
  message: string,
  state: GeneratorStatusState = "idle"
) => {
  const generatorStatus = app.querySelector<HTMLElement>(
    "#studio-generator-status"
  );
  const helpStatus = app.querySelector<HTMLElement>("#studio-help-status");

  if (generatorStatus) {
    generatorStatus.textContent = message;
    generatorStatus.dataset.state = state;
  }

  if (helpStatus) {
    helpStatus.textContent = message;
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

const upsertSourceTexture = (
  textures: StudioSourceTexture[],
  texture: StudioSourceTexture
) => {
  const nextTextures = textures.filter(
    (existingTexture) => existingTexture.textureId !== texture.textureId
  );

  nextTextures.unshift(texture);
  return nextTextures.sort((left, right) => right.updatedAt - left.updatedAt);
};

const upsertManySourceTextures = (
  textures: StudioSourceTexture[],
  nextTextures: StudioSourceTexture[]
) =>
  nextTextures.reduce(
    (mergedTextures, texture) => upsertSourceTexture(mergedTextures, texture),
    textures
  );

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const DEFAULT_STUDIO_HELP =
  "Drag to paint. Right/middle drag or two-finger swipe pans. Pinch zooms.";
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
