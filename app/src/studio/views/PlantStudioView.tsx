import React, { useMemo, useState } from "react";

import {
  generatePlantSprite,
  type GeneratedPlantSprite,
  type PlantSpritePromptMetadata,
} from "../convex/convex-studio";
import { SegmentedControl } from "../components/SegmentedControl";
import type {
  PlantSpriteKind,
  StudioPlantSpriteCell,
  StudioPlantSpriteRecord,
} from "../lib/studio-types";

type PlantStatusState = "idle" | "loading" | "success" | "error";

type PreviewPlantSprite = {
  id: string;
  plantId: string;
  label: string;
  kind: PlantSpriteKind;
  url: string | null;
  contentType: string;
  size: number;
  status: string;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  generatedPrompt: string;
  model: string;
  rows: number;
  columns: number;
  cellSize: number;
  atlasWidth: number;
  atlasHeight: number;
  cells: StudioPlantSpriteCell[];
  updatedAt: number;
};

const DEFAULT_PLANT_FORM: PlantSpritePromptMetadata = {
  plantId: "",
  label: "",
  kind: "plant",
  region: "",
  habitat: "",
  objectPrompt: "",
  stylePrompt:
    "cozy hand-painted 2D game plant sprite, three-quarter top-down view, transparent background, readable silhouette at gameplay scale, soft natural edges, warm balanced highlights, no readable text, no logos, no UI",
  cellSize: 128,
};

export function PlantStudioView({
  offline,
  plantSprites,
}: {
  offline: boolean;
  plantSprites: StudioPlantSpriteRecord[];
}) {
  const [form, setForm] =
    useState<PlantSpritePromptMetadata>(DEFAULT_PLANT_FORM);
  const [status, setStatus] = useState<{
    state: PlantStatusState;
    text: string;
  }>({
    state: offline ? "error" : "idle",
    text: offline
      ? "Convex is not configured. Set VITE_CONVEX_URL to use Plant Studio."
      : "Ready to generate a plant or tree sprite sheet.",
  });
  const [selectedSprite, setSelectedSprite] =
    useState<PreviewPlantSprite | null>(null);
  const previewSprite = selectedSprite;
  const activeSpriteId = previewSprite?.id ?? null;

  const generatedAtLabel = useMemo(() => {
    if (!previewSprite) {
      return "No sprite selected";
    }

    return `${previewSprite.columns}x${previewSprite.rows} / ${previewSprite.cellSize}px cells`;
  }, [previewSprite]);

  const updateForm = <K extends keyof PlantSpritePromptMetadata>(
    key: K,
    value: PlantSpritePromptMetadata[K]
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const setKind = (kind: PlantSpriteKind) => {
    setForm((current) => {
      const defaultCellSize = kind === "tree" ? 256 : 128;
      const currentDefault = current.kind === "tree" ? 256 : 128;

      return {
        ...current,
        kind,
        cellSize:
          !current.cellSize || current.cellSize === currentDefault
            ? defaultCellSize
            : current.cellSize,
      };
    });
  };

  const submitGeneration = async () => {
    if (offline) {
      setStatus({
        state: "error",
        text: "Convex is not configured. Set VITE_CONVEX_URL first.",
      });
      return;
    }

    try {
      const nextForm = normalizePlantForm(form);
      setForm(nextForm);
      setStatus({
        state: "loading",
        text: `Generating ${nextForm.label} sprite sheet with Convex...`,
      });

      const sprite = await generatePlantSprite(nextForm);
      const preview = generatedPlantToPreview(sprite);

      setSelectedSprite(preview);
      setStatus({
        state: "success",
        text: `Generated ${nextForm.label}. Review the frame grid before publishing into the game runtime.`,
      });
    } catch (error) {
      setStatus({
        state: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not generate plant sprite.",
      });
    }
  };

  const selectSprite = (sprite: StudioPlantSpriteRecord) => {
    const preview = plantRecordToPreview(sprite);
    setSelectedSprite(preview);
    setForm({
      plantId: sprite.plantId,
      label: sprite.label,
      kind: sprite.kind,
      region: sprite.region,
      habitat: sprite.habitat,
      objectPrompt: sprite.objectPrompt,
      stylePrompt: sprite.stylePrompt,
      cellSize: sprite.cellSize,
    });
    setStatus({
      state: "success",
      text: `Selected ${sprite.label} from the Convex plant library.`,
    });
  };

  const downloadManifest = () => {
    if (!previewSprite) {
      setStatus({ state: "error", text: "Select or generate a sprite first." });
      return;
    }

    const manifest = {
      generatedAt: new Date(previewSprite.updatedAt).toISOString(),
      request: {
        spriteKind: previewSprite.kind,
        objectId: previewSprite.plantId,
        objectName: previewSprite.label,
        objectPrompt: previewSprite.objectPrompt,
        stylePrompt: previewSprite.stylePrompt,
        cellSize: previewSprite.cellSize,
        columns: previewSprite.columns,
        background: "transparent",
      },
      imageModel: previewSprite.model,
      rows: previewSprite.rows,
      columns: previewSprite.columns,
      cellSize: previewSprite.cellSize,
      atlasWidth: previewSprite.atlasWidth,
      atlasHeight: previewSprite.atlasHeight,
      image: {
        id: `${previewSprite.plantId}-sprite-sheet`,
        title: `${previewSprite.label} sprite sheet`,
        prompt: previewSprite.generatedPrompt,
        model: previewSprite.model,
        contentType: previewSprite.contentType,
        url: previewSprite.url,
      },
      cells: previewSprite.cells,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${previewSprite.plantId}-object-sprite-manifest.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ state: "success", text: "Exported plant sprite manifest." });
  };

  return (
    <section className="studio-page studio-page--plants">
      <div className="studio-workshop studio-workshop--plants">
        <section className="studio-workshop__form">
          <div className="studio-section-heading">
            <p className="eyebrow">Plant Studio</p>
            <h2>Sprite Sheet Generator</h2>
          </div>

          <SegmentedControl
            ariaLabel="Plant sprite kind"
            value={form.kind}
            onChange={setKind}
            options={
              [
                { label: "Plant", value: "plant" },
                { label: "Tree", value: "tree" },
              ] as const
            }
          />

          <div className="studio-generator-fields">
            <label>
              Display name
              <input
                placeholder="Moon Reed"
                value={form.label}
                onChange={(event) => updateForm("label", event.target.value)}
              />
            </label>
            <label>
              Plant ID
              <input
                placeholder="moon-reed"
                value={form.plantId}
                onChange={(event) => updateForm("plantId", event.target.value)}
              />
            </label>
            <label>
              Region
              <input
                placeholder="wet meadow"
                value={form.region}
                onChange={(event) => updateForm("region", event.target.value)}
              />
            </label>
            <label>
              Habitat
              <input
                placeholder="grass, water edge, tilled soil"
                value={form.habitat}
                onChange={(event) => updateForm("habitat", event.target.value)}
              />
            </label>
            <label>
              Object prompt
              <textarea
                rows={5}
                placeholder="Describe the plant silhouette, material, harvestable resource, and habitat-specific details."
                value={form.objectPrompt}
                onChange={(event) =>
                  updateForm("objectPrompt", event.target.value)
                }
              />
            </label>
            <label>
              Style prompt
              <textarea
                rows={5}
                value={form.stylePrompt}
                onChange={(event) =>
                  updateForm("stylePrompt", event.target.value)
                }
              />
            </label>
            <label>
              Cell size
              <input
                min={16}
                max={512}
                step={16}
                type="number"
                value={form.cellSize ?? (form.kind === "tree" ? 256 : 128)}
                onChange={(event) =>
                  updateForm("cellSize", Number(event.target.value))
                }
              />
            </label>
          </div>

          <button
            className="studio-primary-action"
            disabled={status.state === "loading" || offline}
            onClick={submitGeneration}
            type="button"
          >
            Generate Sprite Sheet
          </button>
          <div className="studio-generator-status" data-state={status.state}>
            {status.text}
          </div>
        </section>

        <section className="studio-workshop__preview">
          <div className="studio-library-heading">
            <p>Sprite Preview</p>
            <span>{generatedAtLabel}</span>
          </div>
          {previewSprite?.url ? (
            <>
              <div className="studio-sprite-preview">
                <img src={previewSprite.url} alt={`${previewSprite.label}`} />
              </div>
              <div className="studio-frame-grid">
                {previewSprite.cells.map((cell) => (
                  <div
                    className="studio-frame-grid__cell"
                    key={`${cell.row}-${cell.column}`}
                  >
                    <strong>
                      {cell.row},{cell.column}
                    </strong>
                    <span>{cell.stateTitle}</span>
                    <small>
                      {cell.x},{cell.y}
                    </small>
                  </div>
                ))}
              </div>
              <button
                className="studio-command"
                onClick={downloadManifest}
                type="button"
              >
                Export Manifest JSON
              </button>
            </>
          ) : (
            <div className="studio-empty-preview">
              <span aria-hidden="true" />
              <strong>No plant sprite selected</strong>
              <p>
                Generate a custom plant or choose a Convex sprite sheet to
                inspect its 4x4 runtime frame metadata.
              </p>
            </div>
          )}
        </section>

        <section className="studio-workshop__library">
          <div className="studio-library-heading">
            <p>Recent Plants</p>
            <span>{plantSprites.length}</span>
          </div>
          {plantSprites.length > 0 ? (
            <div className="studio-source-texture-list">
              {plantSprites.slice(0, 18).map((sprite) => (
                <button
                  className="studio-source-texture-button studio-plant-card"
                  data-active={activeSpriteId === sprite._id ? "" : undefined}
                  key={sprite._id}
                  onClick={() => selectSprite(sprite)}
                  type="button"
                >
                  <span className="studio-source-texture-thumb studio-source-texture-thumb--atlas">
                    <img src={sprite.url ?? ""} alt="" />
                  </span>
                  <span className="studio-source-texture-meta">
                    <strong>{sprite.label}</strong>
                    <small>
                      {sprite.kind} / {sprite.cellSize}px
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-library-empty">
              No Convex plant sprites yet. Generated plant and tree sheets will
              appear here.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function normalizePlantForm(
  form: PlantSpritePromptMetadata
): PlantSpritePromptMetadata {
  const label = form.label.trim();
  const rawPlantId = form.plantId.trim() || label;
  const plantId = normalizePlantId(rawPlantId);
  const objectPrompt = form.objectPrompt.trim();
  const stylePrompt = form.stylePrompt.trim();
  const cellSize = Math.min(
    512,
    Math.max(
      16,
      Math.floor(form.cellSize ?? (form.kind === "tree" ? 256 : 128))
    )
  );

  if (!label) {
    throw new Error("Display name is required.");
  }

  if (!objectPrompt || !stylePrompt) {
    throw new Error("Object prompt and style prompt are required.");
  }

  return {
    plantId,
    label,
    kind: form.kind,
    region: form.region.trim(),
    habitat: form.habitat.trim(),
    objectPrompt,
    stylePrompt,
    cellSize,
  };
}

function normalizePlantId(value: string) {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!id) {
    throw new Error("Plant ID is required.");
  }

  return id;
}

function plantRecordToPreview(
  sprite: StudioPlantSpriteRecord
): PreviewPlantSprite {
  return {
    id: sprite._id,
    plantId: sprite.plantId,
    label: sprite.label,
    kind: sprite.kind,
    url: sprite.url,
    contentType: sprite.contentType,
    size: sprite.size,
    status: sprite.status,
    region: sprite.region,
    habitat: sprite.habitat,
    objectPrompt: sprite.objectPrompt,
    stylePrompt: sprite.stylePrompt,
    generatedPrompt: sprite.generatedPrompt,
    model: sprite.model,
    rows: sprite.rows,
    columns: sprite.columns,
    cellSize: sprite.cellSize,
    atlasWidth: sprite.atlasWidth,
    atlasHeight: sprite.atlasHeight,
    cells: sprite.cells,
    updatedAt: sprite.updatedAt,
  };
}

function generatedPlantToPreview(
  sprite: GeneratedPlantSprite
): PreviewPlantSprite {
  return {
    id: sprite.spriteId,
    plantId: sprite.plantId,
    label: sprite.label,
    kind: sprite.kind,
    url: sprite.url,
    contentType: sprite.contentType,
    size: sprite.size,
    status: sprite.status,
    region: sprite.region,
    habitat: sprite.habitat,
    objectPrompt: sprite.objectPrompt,
    stylePrompt: sprite.stylePrompt,
    generatedPrompt: sprite.generatedPrompt,
    model: sprite.model,
    rows: sprite.rows,
    columns: sprite.columns,
    cellSize: sprite.cellSize,
    atlasWidth: sprite.atlasWidth,
    atlasHeight: sprite.atlasHeight,
    cells: sprite.cells,
    updatedAt: sprite.updatedAt,
  };
}
