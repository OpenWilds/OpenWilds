import React, { useEffect, useRef, useState } from "react";

import type { TerrainVisualAsset } from "../../assets/visual-assets";
import {
  dataUrlToPngBlob,
  generateSourceTexture,
  registerGeneratedTerrainAsset,
  registerSourceTexture,
  type StudioSourceTexture,
} from "../convex/convex-studio";
import { DEFAULT_FORM } from "../lib/studio-data";
import type { TerrainPromptMetadata } from "../lib/studio-types";
import { terrainLabel } from "../phaser/studio-scene";
import {
  buildTerrainTexturePrompt,
  generateTerrainAsset,
  normalizeTerrainId,
} from "../phaser/terrain-generator";

type TextureQueueItem = TerrainPromptMetadata & {
  queueId: string;
  message?: string;
  previewUrl?: string | null;
  state: "queued" | "running" | "success" | "error";
  textureId?: string;
};

const MAX_PARALLEL_TEXTURE_JOBS = 3;

export function TextureStudioView({
  generatedTerrains,
  offline,
  selectedSourceTexture,
  setSelectedSourceTexture,
  sourceTextures,
}: {
  generatedTerrains: TerrainVisualAsset[];
  offline: boolean;
  selectedSourceTexture: StudioSourceTexture | null;
  setSelectedSourceTexture: (texture: StudioSourceTexture | null) => void;
  sourceTextures: StudioSourceTexture[];
}) {
  const [form, setForm] = useState<TerrainPromptMetadata>(DEFAULT_FORM);
  const [status, setStatus] = useState({
    state: "idle" as "idle" | "loading" | "success" | "error",
    text: offline
      ? "Convex is not configured. Set VITE_CONVEX_URL to use Studio storage."
      : "Ready to generate a source texture.",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedTerrain, setSelectedTerrain] =
    useState<TerrainVisualAsset | null>(null);
  const [textureQueue, setTextureQueue] = useState<TextureQueueItem[]>([]);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const runningTextureJobsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!selectedTerrain) {
      setPreviewUrl(selectedSourceTexture?.url ?? null);
    }
  }, [selectedSourceTexture]);

  useEffect(() => {
    if (!selectedTerrain) {
      return;
    }

    const refreshedTerrain = generatedTerrains.find(
      (terrain) => terrain.id === selectedTerrain.id
    );

    if (refreshedTerrain) {
      setSelectedTerrain(refreshedTerrain);
    }
  }, [generatedTerrains, selectedTerrain]);

  const updateForm = (field: keyof TerrainPromptMetadata, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const selectTexture = (texture: StudioSourceTexture) => {
    setSelectedTerrain(null);
    setSelectedSourceTexture(texture);
    setForm({
      terrainId: texture.terrainId,
      label: texture.label,
      material: texture.material,
      texturePrompt: texture.texturePrompt,
      stylePrompt: texture.stylePrompt,
    });
    setStatus({
      state: "success",
      text: `Selected ${texture.label} source texture. Build terrain when ready.`,
    });
  };

  const selectTerrain = (terrain: TerrainVisualAsset) => {
    setSelectedTerrain(terrain);
    setSelectedSourceTexture(null);
    setPreviewUrl(null);
    setStatus({
      state: "success",
      text: `Selected ${
        terrain.label ?? terrainLabel(terrain.id)
      } terrain tileset.`,
    });
  };

  const readForm = () => {
    const label = form.label.trim();
    const rawTerrainId = form.terrainId.trim() || label;
    if (!rawTerrainId) {
      throw new Error("Name or terrain ID is required.");
    }
    const terrainId = normalizeTerrainId(rawTerrainId);
    const material = form.material.trim() || label;
    const texturePrompt = form.texturePrompt.trim();
    const stylePrompt = form.stylePrompt.trim();

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

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(
        buildTerrainTexturePrompt(readForm())
      );
      setStatus({ state: "success", text: "Copied source texture prompt." });
    } catch (error) {
      setStatus({
        state: "error",
        text: error instanceof Error ? error.message : "Could not copy prompt.",
      });
    }
  };

  useEffect(() => {
    if (offline) {
      return;
    }

    const availableSlots =
      MAX_PARALLEL_TEXTURE_JOBS - runningTextureJobsRef.current.size;
    if (availableSlots <= 0) {
      return;
    }

    const nextJobs = textureQueue
      .filter(
        (item) =>
          item.state === "queued" &&
          !runningTextureJobsRef.current.has(item.queueId)
      )
      .slice(0, availableSlots);
    if (!nextJobs.length) {
      return;
    }

    for (const nextJob of nextJobs) {
      runningTextureJobsRef.current.add(nextJob.queueId);
    }

    setTextureQueue((current) =>
      current.map((item) =>
        nextJobs.some((job) => job.queueId === item.queueId)
          ? {
              ...item,
              state: "running",
              message: "Generating with Convex...",
            }
          : item
      )
    );
    setStatus({
      state: "loading",
      text: `Running ${
        runningTextureJobsRef.current.size
      } texture generation job${
        runningTextureJobsRef.current.size === 1 ? "" : "s"
      } in parallel.`,
    });

    for (const nextJob of nextJobs) {
      void generateSourceTexture(queueItemToPrompt(nextJob))
        .then((texture) => {
          setSelectedTerrain(null);
          setSelectedSourceTexture(texture);
          setPreviewUrl(texture.url);
          setTextureQueue((current) =>
            current.map((item) =>
              item.queueId === nextJob.queueId
                ? {
                    ...item,
                    state: "success",
                    message: "Done",
                    previewUrl: texture.url,
                    textureId: texture.textureId,
                  }
                : item
            )
          );
          setStatus({
            state: "success",
            text: `Generated ${nextJob.label}.`,
          });
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Texture generation failed.";
          setTextureQueue((current) =>
            current.map((item) =>
              item.queueId === nextJob.queueId
                ? {
                    ...item,
                    state: "error",
                    message,
                  }
                : item
            )
          );
          setStatus({ state: "error", text: message });
        })
        .finally(() => {
          runningTextureJobsRef.current.delete(nextJob.queueId);
          setTextureQueue((current) => [...current]);
        });
    }
  }, [offline, setSelectedSourceTexture, textureQueue]);

  const queueTexture = () => {
    try {
      const nextForm = readForm();
      const queueId = createQueueId();
      setTextureQueue((current) => [
        ...current,
        {
          ...nextForm,
          queueId,
          state: "queued",
          message: "Waiting",
        },
      ]);
      setStatus({
        state: "success",
        text: `Queued ${nextForm.label} for texture generation.`,
      });
    } catch (error) {
      setStatus({
        state: "error",
        text:
          error instanceof Error ? error.message : "Could not queue texture.",
      });
    }
  };

  const clearFinishedQueueItems = () => {
    setTextureQueue((current) =>
      current.filter(
        (item) => item.state === "queued" || item.state === "running"
      )
    );
  };

  const buildTerrain = async () => {
    const source = sourceInputRef.current?.files?.[0];

    if (!source && !selectedSourceTexture?.url) {
      setStatus({
        state: "error",
        text: "Generate or choose a source texture first.",
      });
      return;
    }

    try {
      setIsBusy(true);
      const nextForm = readForm();
      let sourceTextureId = selectedSourceTexture?.textureId;
      let sourceTexture: File | Blob = source as File;

      if (source) {
        setStatus({
          state: "loading",
          text: "Uploading source texture to Convex...",
        });
        sourceTextureId = await registerSourceTexture({
          ...nextForm,
          file: source,
        });
        setSelectedSourceTexture(null);
      } else if (selectedSourceTexture?.url) {
        setStatus({
          state: "loading",
          text: "Loading generated source texture...",
        });
        const response = await fetch(selectedSourceTexture.url);

        if (!response.ok) {
          throw new Error("Could not load generated source texture.");
        }

        sourceTexture = await response.blob();
      }

      setStatus({ state: "loading", text: "Building autotile terrain..." });
      const asset = await generateTerrainAsset({
        ...nextForm,
        sourceTexture,
      });
      setStatus({
        state: "loading",
        text: "Uploading generated terrain to Convex...",
      });
      await registerGeneratedTerrainAsset({
        ...nextForm,
        sourceTextureId,
        atlasBlob: await dataUrlToPngBlob(asset.atlasUrl),
        centerVariantsBlob: await dataUrlToPngBlob(asset.centerVariantsUrl),
      });
      setStatus({
        state: "success",
        text: `Saved ${nextForm.label} to Convex and added it to the palette.`,
      });
    } catch (error) {
      setStatus({
        state: "error",
        text:
          error instanceof Error ? error.message : "Terrain generation failed.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="studio-page studio-page--textures">
      <div className="studio-workshop">
        <section className="studio-workshop__form">
          <div className="studio-section-heading">
            <p className="eyebrow">Texture Workshop</p>
            <h2>Source Texture Generator</h2>
          </div>
          <div className="studio-generator-fields studio-generator-fields--workshop">
            <label>
              Name
              <input
                type="text"
                value={form.label}
                onChange={(event) => updateForm("label", event.target.value)}
              />
            </label>
            <label>
              Terrain ID
              <input
                type="text"
                value={form.terrainId}
                onChange={(event) =>
                  updateForm("terrainId", event.target.value)
                }
              />
            </label>
            <label>
              Material
              <input
                type="text"
                value={form.material}
                onChange={(event) => updateForm("material", event.target.value)}
              />
            </label>
            <label>
              Texture Brief
              <textarea
                rows={5}
                value={form.texturePrompt}
                onChange={(event) =>
                  updateForm("texturePrompt", event.target.value)
                }
              />
            </label>
            <label>
              Style Direction
              <textarea
                rows={5}
                value={form.stylePrompt}
                onChange={(event) =>
                  updateForm("stylePrompt", event.target.value)
                }
              />
            </label>
            <label>
              Source texture PNG
              <input
                ref={sourceInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </label>
          </div>
          <div className="studio-command-grid">
            <button disabled={offline} onClick={queueTexture} type="button">
              Queue Texture
            </button>
            <button disabled={isBusy} onClick={copyPrompt} type="button">
              Copy Prompt
            </button>
          </div>
          <button
            className="studio-command"
            disabled={isBusy || offline}
            onClick={buildTerrain}
            type="button"
          >
            Build Terrain From Texture
          </button>
          <div
            className="studio-generator-status"
            data-state={status.state}
            aria-live="polite"
          >
            {status.text}
          </div>
          <div className="studio-generation-queue">
            <div className="studio-generation-queue__header">
              <strong>
                Texture Queue · {runningTextureJobsRef.current.size}/
                {MAX_PARALLEL_TEXTURE_JOBS} running
              </strong>
              <button
                disabled={!textureQueue.some(isFinishedQueueItem)}
                onClick={clearFinishedQueueItems}
                type="button"
              >
                Clear Done
              </button>
            </div>
            {textureQueue.length > 0 ? (
              <div className="studio-generation-queue__list">
                {textureQueue.map((item, index) => (
                  <button
                    className="studio-generation-queue__item"
                    data-state={item.state}
                    key={item.queueId}
                    onClick={() => {
                      if (item.textureId && item.previewUrl) {
                        setSelectedTerrain(null);
                        setPreviewUrl(item.previewUrl);
                      }
                    }}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <strong>{item.label}</strong>
                    <small>{item.message ?? queueStateLabel(item.state)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="studio-note">
                Add several prompt variants here. They will generate one at a
                time.
              </p>
            )}
          </div>
        </section>

        <section className="studio-workshop__preview">
          <div className="studio-section-heading">
            <p className="eyebrow">Review</p>
            <h2>Selected Source</h2>
          </div>
          {selectedTerrain ? (
            <div className="studio-tileset-preview">
              <div>
                <span>Autotile Atlas</span>
                <img
                  src={selectedTerrain.atlasUrl}
                  alt={`${
                    selectedTerrain.label ?? terrainLabel(selectedTerrain.id)
                  } autotile atlas`}
                />
              </div>
              <div>
                <span>Center Variants</span>
                <img
                  src={selectedTerrain.centerVariantsUrl}
                  alt={`${
                    selectedTerrain.label ?? terrainLabel(selectedTerrain.id)
                  } center variants`}
                />
              </div>
            </div>
          ) : previewUrl ? (
            <div className="studio-texture-preview">
              <img
                src={previewUrl}
                alt="Generated terrain source texture preview"
              />
            </div>
          ) : (
            <div className="studio-empty-preview">
              <span aria-hidden="true" />
              <strong>No source selected</strong>
              <p>
                Generate or choose a Convex source texture, or select a terrain
                tileset below.
              </p>
            </div>
          )}
          <p className="studio-note">
            Use generated or uploaded source textures here, then build a 47-tile
            terrain set for the map palette.
          </p>
        </section>

        <section className="studio-workshop__library">
          <div className="studio-library-heading">
            <div className="studio-section-heading">
              <p className="eyebrow">Library</p>
              <h2>Recent Textures</h2>
            </div>
            <span>{sourceTextures.length} Convex</span>
          </div>
          {sourceTextures.length > 0 ? (
            <div className="studio-source-textures">
              <div className="studio-source-texture-list">
                {sourceTextures.slice(0, 12).map((texture) => (
                  <button
                    className="studio-source-texture-button"
                    data-active={
                      selectedSourceTexture?.textureId === texture.textureId
                        ? ""
                        : undefined
                    }
                    key={texture.textureId}
                    onClick={() => selectTexture(texture)}
                    type="button"
                  >
                    <span className="studio-source-texture-thumb">
                      <img src={texture.url ?? ""} alt="" />
                    </span>
                    <span className="studio-source-texture-meta">
                      <strong>{texture.label}</strong>
                      <small>
                        {texture.status}
                        {" · "}
                        {formatTextureSize(texture.size)}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="studio-empty-preview">
              <span aria-hidden="true" />
              <strong>No Convex textures loaded</strong>
              <p>
                Recent Textures now only displays source textures from Convex.
              </p>
            </div>
          )}
          <div className="studio-library-heading studio-library-heading--secondary">
            <div className="studio-section-heading">
              <p className="eyebrow">Output</p>
              <h2>Terrain Tilesets</h2>
            </div>
            <span>{generatedTerrains.length} Terrain</span>
          </div>
          {generatedTerrains.length > 0 ? (
            <div className="studio-source-textures">
              <div className="studio-source-texture-list">
                {generatedTerrains.slice(0, 12).map((terrain) => (
                  <button
                    className="studio-source-texture-button"
                    data-active={
                      selectedTerrain?.id === terrain.id ? "" : undefined
                    }
                    key={terrain.id}
                    onClick={() => selectTerrain(terrain)}
                    type="button"
                  >
                    <span className="studio-source-texture-thumb studio-source-texture-thumb--atlas">
                      <img src={terrain.centerVariantsUrl} alt="" />
                    </span>
                    <span className="studio-source-texture-meta">
                      <strong>
                        {terrain.label ?? terrainLabel(terrain.id)}
                      </strong>
                      <small>tileset · atlas</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="studio-library-empty">
              Build terrain from a source texture to inspect its generated
              tileset here.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function formatTextureSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "stored";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFinishedQueueItem(item: TextureQueueItem) {
  return item.state === "success" || item.state === "error";
}

function queueStateLabel(state: TextureQueueItem["state"]) {
  switch (state) {
    case "queued":
      return "Waiting";
    case "running":
      return "Generating";
    case "success":
      return "Done";
    case "error":
      return "Failed";
  }
}

function queueItemToPrompt(item: TextureQueueItem): TerrainPromptMetadata {
  return {
    terrainId: item.terrainId,
    label: item.label,
    material: item.material,
    texturePrompt: item.texturePrompt,
    stylePrompt: item.stylePrompt,
  };
}
