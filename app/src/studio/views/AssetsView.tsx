import React from "react";

import type { StudioRouteId } from "../lib/studio-types";

export function AssetsView({
  setRoute,
}: {
  setRoute: (route: StudioRouteId) => void;
}) {
  return (
    <section className="studio-page">
      <div className="studio-empty-module">
        <span aria-hidden="true">AS</span>
        <h2>Asset Library</h2>
        <p>
          Generated terrain and source textures are available from the Texture
          Studio and Map Editor today.
        </p>
        <button
          className="studio-primary-action"
          onClick={() => setRoute("textures")}
          type="button"
        >
          Open Texture Studio
        </button>
      </div>
    </section>
  );
}
