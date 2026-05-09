import React from "react";

import type { StudioRouteId } from "../lib/studio-types";

export function DashboardView({
  setRoute,
  sourceTextureCount,
  terrainCount,
}: {
  setRoute: (route: StudioRouteId) => void;
  sourceTextureCount: number;
  terrainCount: number;
}) {
  return (
    <section className="studio-page">
      <div className="studio-dashboard">
        <div className="studio-stats-grid">
          <article className="studio-stat">
            <span>Total Terrain Assets</span>
            <strong>{terrainCount}</strong>
            <small>Built-in and generated</small>
          </article>
          <article className="studio-stat">
            <span>Source Textures</span>
            <strong>{sourceTextureCount}</strong>
            <small>Live from Convex</small>
          </article>
          <article className="studio-stat">
            <span>Active Map</span>
            <strong>40x40</strong>
            <small>Layered terrain grid</small>
          </article>
        </div>

        <div className="studio-dashboard-grid">
          <section className="studio-feature-panel">
            <div>
              <p className="eyebrow">AI Generation</p>
              <h2>Generate Seamless Terrain Textures</h2>
              <p>
                Create source textures, review the result, then build map-ready
                autotile terrain for the palette.
              </p>
            </div>
            <button
              className="studio-primary-action"
              onClick={() => setRoute("textures")}
              type="button"
            >
              Open Texture Studio
            </button>
          </section>

          <section className="studio-recent-panel">
            <div className="studio-section-heading">
              <p className="eyebrow">Recent Work</p>
              <h2>Studio Shortcuts</h2>
            </div>
            <button
              className="studio-recent-item"
              onClick={() => setRoute("map")}
              type="button"
            >
              <span className="studio-recent-item__icon" aria-hidden="true">
                MP
              </span>
              <span>
                <strong>Open map editor</strong>
                <small>Paint layers and export JSON</small>
              </span>
            </button>
            <button
              className="studio-recent-item"
              onClick={() => setRoute("textures")}
              type="button"
            >
              <span className="studio-recent-item__icon" aria-hidden="true">
                TX
              </span>
              <span>
                <strong>Generate terrain source</strong>
                <small>Create a reusable texture</small>
              </span>
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
