import {
  CubeIcon,
  DatabaseIcon,
  HouseIcon,
  ImageSquareIcon,
  MapTrifoldIcon,
  PlantIcon,
  SignOutIcon,
  SquaresFourIcon,
  type Icon,
} from "@phosphor-icons/react";
import React, { useEffect, useState } from "react";

import openWildsLogoUrl from "../../assets/openwilds-logo.png?url";
import type { TerrainVisualAsset } from "../../assets/visual-assets";
import type { StudioSourceTexture } from "../convex/convex-studio";
import { useStudioRoute } from "../hooks/use-studio-route";
import { ROUTES } from "../lib/studio-data";
import type {
  StudioMapRecord,
  StudioObjectSpriteRecord,
  StudioPlantSpriteRecord,
  StudioRouteId,
} from "../lib/studio-types";
import { AssetsView } from "../views/AssetsView";
import { DashboardView } from "../views/DashboardView";
import { ObjectStudioView } from "../views/ObjectStudioView";
import { PlantStudioView } from "../views/PlantStudioView";
import { TextureStudioView } from "../views/TextureStudioView";
import { WorldStudioView } from "../views/WorldStudioView";

const ROUTE_ICONS: Record<StudioRouteId, Icon> = {
  assets: DatabaseIcon,
  dashboard: SquaresFourIcon,
  map: MapTrifoldIcon,
  objects: CubeIcon,
  plants: PlantIcon,
  textures: ImageSquareIcon,
};

export function StudioShell({
  generatedTerrains,
  offline = false,
  objectSprites,
  onSignOut,
  plantSprites,
  savedWorlds,
  sourceTextures,
  userLabel = "Creator Admin",
}: {
  generatedTerrains: TerrainVisualAsset[];
  isLoading?: boolean;
  offline?: boolean;
  objectSprites: StudioObjectSpriteRecord[];
  onSignOut?: () => void;
  plantSprites: StudioPlantSpriteRecord[];
  savedWorlds: StudioMapRecord[];
  sourceTextures: StudioSourceTexture[];
  userLabel?: string;
}) {
  const [route, setRoute] = useStudioRoute();
  const [selectedSourceTexture, setSelectedSourceTexture] =
    useState<StudioSourceTexture | null>(null);

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
        <div
          aria-label="OpenWilds Studio"
          className="studio-brand"
          data-tooltip="OpenWilds Studio"
        >
          <img
            alt=""
            aria-hidden="true"
            className="studio-brand__logo"
            draggable={false}
            src={openWildsLogoUrl}
          />
        </div>
        <nav className="studio-nav" aria-label="Studio sections">
          {Object.values(ROUTES).map((item) => (
            <button
              aria-label={item.title}
              data-active={route === item.id ? "" : undefined}
              data-tooltip={item.title}
              key={item.id}
              onClick={() => setRoute(item.id)}
              type="button"
            >
              {React.createElement(ROUTE_ICONS[item.id], {
                "aria-hidden": true,
                size: 22,
                weight: route === item.id ? "fill" : "bold",
              })}
            </button>
          ))}
        </nav>
        <div className="studio-sidebar-actions">
          <div
            aria-label={`${userLabel} - ${
              offline ? "Offline Studio" : "Convex Studio"
            }`}
            className="studio-user-card"
            data-tooltip={`${userLabel} - ${
              offline ? "Offline Studio" : "Convex Studio"
            }`}
          >
            <div className="studio-user-card__avatar" aria-hidden="true">
              {userLabel.trim().charAt(0).toUpperCase() || "A"}
            </div>
          </div>
          {onSignOut ? (
            <button
              aria-label="Sign out"
              className="studio-link studio-link--button"
              data-tooltip="Sign out"
              onClick={onSignOut}
              type="button"
            >
              <SignOutIcon aria-hidden="true" size={22} weight="bold" />
            </button>
          ) : null}
          <a
            aria-label="Back to game"
            className="studio-link"
            data-tooltip="Back to game"
            href="/"
          >
            <HouseIcon aria-hidden="true" size={22} weight="bold" />
          </a>
        </div>
      </aside>

      <main className="studio-main">
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
            objectSprites={objectSprites}
            plantSprites={plantSprites}
            savedWorlds={savedWorlds}
          />
        ) : null}
        {route === "plants" ? (
          <PlantStudioView offline={offline} plantSprites={plantSprites} />
        ) : null}
        {route === "objects" ? (
          <ObjectStudioView objectSprites={objectSprites} offline={offline} />
        ) : null}
        {route === "assets" ? <AssetsView setRoute={setRoute} /> : null}
      </main>
    </section>
  );
}
