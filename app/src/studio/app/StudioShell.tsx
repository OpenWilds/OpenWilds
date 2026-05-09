import React, { useEffect, useState } from "react";

import type { TerrainVisualAsset } from "../../assets/visual-assets";
import type { StudioSourceTexture } from "../convex/convex-studio";
import { useStudioRoute } from "../hooks/use-studio-route";
import { ROUTES } from "../lib/studio-data";
import type {
  StudioMapRecord,
  StudioPlantSpriteRecord,
} from "../lib/studio-types";
import { AssetsView } from "../views/AssetsView";
import { DashboardView } from "../views/DashboardView";
import { PlantStudioView } from "../views/PlantStudioView";
import { TextureStudioView } from "../views/TextureStudioView";
import { WorldStudioView } from "../views/WorldStudioView";

export function StudioShell({
  generatedTerrains,
  isLoading = false,
  offline = false,
  plantSprites,
  savedWorlds,
  sourceTextures,
}: {
  generatedTerrains: TerrainVisualAsset[];
  isLoading?: boolean;
  offline?: boolean;
  plantSprites: StudioPlantSpriteRecord[];
  savedWorlds: StudioMapRecord[];
  sourceTextures: StudioSourceTexture[];
}) {
  const [route, setRoute] = useStudioRoute();
  const [selectedSourceTexture, setSelectedSourceTexture] =
    useState<StudioSourceTexture | null>(null);
  const routeLabel = ROUTES[route] ?? ROUTES.dashboard;

  useEffect(() => {
    if (selectedSourceTexture) {
      const nextTexture = sourceTextures.find(
        (texture) => texture.textureId === selectedSourceTexture.textureId
      );

      if (nextTexture) {
        setSelectedSourceTexture(nextTexture);
      }
    }
  }, [selectedSourceTexture, sourceTextures]);

  return (
    <section className="studio-shell">
      <aside className="studio-sidebar" aria-label="Studio navigation">
        <div className="studio-brand">
          <div className="studio-brand__mark" aria-hidden="true">
            OW
          </div>
          <div>
            <p className="eyebrow">Open Wilds</p>
            <h1>Studio</h1>
          </div>
        </div>
        <nav className="studio-nav" aria-label="Studio sections">
          <p>Studio Tools</p>
          {Object.values(ROUTES).map((item) => (
            <button
              data-active={route === item.id ? "" : undefined}
              key={item.id}
              onClick={() => setRoute(item.id)}
              type="button"
            >
              <span className="studio-nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <div className="studio-user-card">
          <div className="studio-user-card__avatar" aria-hidden="true">
            A
          </div>
          <div>
            <strong>Creator Admin</strong>
            <span>{offline ? "Offline Studio" : "Convex Studio"}</span>
          </div>
        </div>
        <a className="studio-link" href="/">
          Back to game
        </a>
      </aside>

      <main className="studio-main">
        <header className="studio-topbar">
          <div className="studio-topbar__title">
            <span className="studio-topbar__icon" aria-hidden="true">
              {routeLabel.icon}
            </span>
            <div>
              <p className="eyebrow">{routeLabel.kicker}</p>
              <h2>{routeLabel.title}</h2>
            </div>
          </div>
          <div className="studio-topbar__actions">
            <label className="studio-search">
              <span aria-hidden="true" />
              <input type="search" placeholder="Search assets, maps..." />
            </label>
            <div className="studio-topbar__meta">
              <span>Convex Library</span>
              <strong>
                {offline
                  ? "Offline"
                  : isLoading
                  ? "Syncing"
                  : `${generatedTerrains.length} terrain / ${sourceTextures.length} textures / ${plantSprites.length} plants`}
              </strong>
            </div>
            <a className="studio-playtest" href="/">
              Playtest
            </a>
          </div>
        </header>

        {route === "dashboard" ? (
          <DashboardView
            plantSpriteCount={plantSprites.length}
            setRoute={setRoute}
            sourceTextureCount={sourceTextures.length}
            terrainCount={generatedTerrains.length}
          />
        ) : null}
        {route === "textures" ? (
          <TextureStudioView
            generatedTerrains={generatedTerrains}
            offline={offline}
            selectedSourceTexture={selectedSourceTexture}
            setSelectedSourceTexture={setSelectedSourceTexture}
            sourceTextures={sourceTextures}
          />
        ) : null}
        {route === "map" ? (
          <WorldStudioView
            generatedTerrains={generatedTerrains}
            savedWorlds={savedWorlds}
          />
        ) : null}
        {route === "plants" ? (
          <PlantStudioView offline={offline} plantSprites={plantSprites} />
        ) : null}
        {route === "assets" ? <AssetsView setRoute={setRoute} /> : null}
      </main>
    </section>
  );
}
