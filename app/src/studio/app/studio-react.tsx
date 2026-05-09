import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import React, { useMemo } from "react";
import { createRoot } from "react-dom/client";

import type { TerrainVisualAsset } from "../../assets/visual-assets";
import { StudioShell } from "./StudioShell";
import { refs, textureRecordToSourceTexture } from "../lib/studio-data";

declare const __OPEN_WILDS_CONVEX_URL__: string;

const convexUrl = __OPEN_WILDS_CONVEX_URL__;

export const bootStudio = (app: HTMLElement) => {
  app.classList.add("studio-app");

  const root = createRoot(app);

  if (!convexUrl) {
    root.render(<StudioApp offline />);
    return root;
  }

  root.render(
    <ConvexProvider client={new ConvexReactClient(convexUrl)}>
      <StudioApp />
    </ConvexProvider>
  );

  return root;
};

function StudioApp({ offline = false }: { offline?: boolean }) {
  if (offline) {
    return (
      <StudioShell
        offline
        sourceTextures={[]}
        generatedTerrains={[]}
        objectSprites={[]}
        plantSprites={[]}
        savedWorlds={[]}
      />
    );
  }

  return <ReactiveStudioShell />;
}

function ReactiveStudioShell() {
  const textureRecords = useQuery(refs.listTerrainTextures, {});
  const terrainRecords = useQuery(refs.listTerrainAssets, {
    status: "library",
  });
  const savedWorlds = useQuery(refs.listMaps, {});
  const plantSprites = useQuery(refs.listPlantSprites, {
    status: "library",
  });
  const objectSprites = useQuery(refs.listObjectSprites, {
    status: "library",
  });
  const sourceTextures = useMemo(
    () =>
      (textureRecords ?? [])
        .filter((record) => record.url && record.status !== "archived")
        .map(textureRecordToSourceTexture),
    [textureRecords]
  );
  const generatedTerrains = useMemo<TerrainVisualAsset[]>(
    () =>
      (terrainRecords ?? []).flatMap((record) =>
        record.atlasUrl && record.centerVariantsUrl
          ? [
              {
                id: record.terrainId,
                label: record.label,
                atlasUrl: record.atlasUrl,
                centerVariantsUrl: record.centerVariantsUrl,
                generated: true,
              },
            ]
          : []
      ),
    [terrainRecords]
  );

  return (
    <StudioShell
      sourceTextures={sourceTextures}
      generatedTerrains={generatedTerrains}
      objectSprites={(objectSprites ?? []).filter(
        (sprite) => sprite.url && sprite.status !== "archived"
      )}
      plantSprites={(plantSprites ?? []).filter(
        (sprite) => sprite.url && sprite.status !== "archived"
      )}
      savedWorlds={savedWorlds ?? []}
      isLoading={
        textureRecords === undefined ||
        terrainRecords === undefined ||
        savedWorlds === undefined ||
        plantSprites === undefined ||
        objectSprites === undefined
      }
    />
  );
}
