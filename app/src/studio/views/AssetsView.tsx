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
          Generated terrain, source textures, and plant sprite sheets are
          available from the studio pipeline today.
        </p>
        <div className="studio-command-grid">
          <button onClick={() => setRoute("textures")} type="button">
            Texture Studio
          </button>
          <button onClick={() => setRoute("plants")} type="button">
            Plant Studio
          </button>
        </div>
      </div>
    </section>
  );
}
