import React from "react";

import type { StudioRouteId } from "../lib/studio-types";

export function DashboardView({
  plantSpriteCount,
  setRoute,
  sourceTextureCount,
  terrainCount,
}: {
  plantSpriteCount: number;
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
            <small>Generated in Convex</small>
          </article>
          <article className="studio-stat">
            <span>Source Textures</span>
            <strong>{sourceTextureCount}</strong>
            <small>Live from Convex</small>
          </article>
          <article className="studio-stat">
            <span>Plant Sprites</span>
            <strong>{plantSpriteCount}</strong>
            <small>4x4 sheets in Convex</small>
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
                WS
              </span>
              <span>
                <strong>Open world studio</strong>
                <small>Name a world, choose layer 0, paint layers</small>
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
            <button
              className="studio-recent-item"
              onClick={() => setRoute("plants")}
              type="button"
            >
              <span className="studio-recent-item__icon" aria-hidden="true">
                PL
              </span>
              <span>
                <strong>Open plant studio</strong>
                <small>Generate plant and tree sprite sheets</small>
              </span>
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
