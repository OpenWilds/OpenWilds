import React, { useMemo, useState } from "react";

import {
  generateObjectSprite,
  type GeneratedObjectSprite,
  type ObjectSpritePromptMetadata,
} from "../convex/convex-studio";
import type {
  ObjectSpriteKind,
  StudioObjectSpriteRecord,
} from "../lib/studio-types";

type ObjectStatusState = "idle" | "loading" | "success" | "error";

type PreviewObjectSprite = {
  id: string;
  objectId: string;
  label: string;
  kind: ObjectSpriteKind;
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
  updatedAt: number;
};

const DEFAULT_OBJECT_FORM: ObjectSpritePromptMetadata = {
  objectId: "",
  label: "",
  kind: "building",
  region: "",
  habitat: "",
  objectPrompt: "",
  stylePrompt:
    "cozy hand-painted 2D game sprite, three-quarter top-down view, transparent background, readable silhouette at gameplay scale, soft natural edges, warm balanced highlights, no readable text, no logos, no UI",
};

export function ObjectStudioView({
  objectSprites,
  offline,
}: {
  objectSprites: StudioObjectSpriteRecord[];
  offline: boolean;
}) {
  const [form, setForm] =
    useState<ObjectSpritePromptMetadata>(DEFAULT_OBJECT_FORM);
  const [status, setStatus] = useState<{
    state: ObjectStatusState;
    text: string;
  }>({
    state: offline ? "error" : "idle",
    text: offline
      ? "Convex is not configured. Set VITE_CONVEX_URL to use Object Studio."
      : "Ready to generate a building or object sprite.",
  });
  const [selectedSprite, setSelectedSprite] =
    useState<PreviewObjectSprite | null>(null);
  const activeSpriteId = selectedSprite?.id ?? null;

  const selectedLabel = useMemo(() => {
    if (!selectedSprite) {
      return "No object selected";
    }

    return `${selectedSprite.kind} / ${formatBytes(selectedSprite.size)}`;
  }, [selectedSprite]);

  const updateForm = <K extends keyof ObjectSpritePromptMetadata>(
    key: K,
    value: ObjectSpritePromptMetadata[K]
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
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
      const nextForm = normalizeObjectForm(form);
      setForm(nextForm);
      setStatus({
        state: "loading",
        text: `Generating ${nextForm.label} with Convex...`,
      });

      const sprite = await generateObjectSprite(nextForm);
      const preview = generatedObjectToPreview(sprite);

      setSelectedSprite(preview);
      setStatus({
        state: "success",
        text: `Generated ${nextForm.label}. It is available in World Studio object placement.`,
      });
    } catch (error) {
      setStatus({
        state: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not generate object sprite.",
      });
    }
  };

  const selectSprite = (sprite: StudioObjectSpriteRecord) => {
    const preview = objectRecordToPreview(sprite);
    setSelectedSprite(preview);
    setForm({
      objectId: sprite.objectId,
      label: sprite.label,
      kind: sprite.kind,
      region: sprite.region,
      habitat: sprite.habitat,
      objectPrompt: sprite.objectPrompt,
      stylePrompt: sprite.stylePrompt,
    });
    setStatus({
      state: "success",
      text: `Selected ${sprite.label} from the Convex object library.`,
    });
  };

  const downloadManifest = () => {
    if (!selectedSprite) {
      setStatus({ state: "error", text: "Select or generate an object first." });
      return;
    }

    const manifest = {
      generatedAt: new Date(selectedSprite.updatedAt).toISOString(),
      request: {
        spriteKind: selectedSprite.kind,
        objectId: selectedSprite.objectId,
        objectName: selectedSprite.label,
        objectPrompt: selectedSprite.objectPrompt,
        stylePrompt: selectedSprite.stylePrompt,
        background: "transparent",
      },
      imageModel: selectedSprite.model,
      image: {
        id: `${selectedSprite.objectId}-object-sprite`,
        title: `${selectedSprite.label} object sprite`,
        prompt: selectedSprite.generatedPrompt,
        model: selectedSprite.model,
        contentType: selectedSprite.contentType,
        url: selectedSprite.url,
      },
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedSprite.objectId}-object-sprite-manifest.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ state: "success", text: "Exported object sprite manifest." });
  };

  return (
    <section className="studio-page studio-page--objects">
      <div className="studio-workshop studio-workshop--plants">
        <section className="studio-workshop__form">
          <div className="studio-section-heading">
            <p className="eyebrow">Object Studio</p>
            <h2>Single Sprite Generator</h2>
          </div>

          <div className="studio-segmented" aria-label="Object sprite kind">
            <button
              data-active={form.kind === "building" ? "" : undefined}
              onClick={() => updateForm("kind", "building")}
              type="button"
            >
              Building
            </button>
            <button
              data-active={form.kind === "object" ? "" : undefined}
              onClick={() => updateForm("kind", "object")}
              type="button"
            >
              Object
            </button>
          </div>

          <div className="studio-generator-fields">
            <label>
              Display name
              <input
                placeholder="Moonwell Cottage"
                value={form.label}
                onChange={(event) => updateForm("label", event.target.value)}
              />
            </label>
            <label>
              Object ID
              <input
                placeholder="moonwell-cottage"
                value={form.objectId}
                onChange={(event) =>
                  updateForm("objectId", event.target.value)
                }
              />
            </label>
            <label>
              Region
              <input
                placeholder="forest village"
                value={form.region}
                onChange={(event) => updateForm("region", event.target.value)}
              />
            </label>
            <label>
              Terrain/habitat notes
              <input
                placeholder="grass, stone plaza, forest floor"
                value={form.habitat}
                onChange={(event) => updateForm("habitat", event.target.value)}
              />
            </label>
            <label>
              Object prompt
              <textarea
                rows={5}
                placeholder="Describe the building or prop silhouette, materials, scale, and world placement details."
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
          </div>

          <button
            className="studio-primary-action"
            disabled={status.state === "loading" || offline}
            onClick={submitGeneration}
            type="button"
          >
            Generate Object Sprite
          </button>
          <div className="studio-generator-status" data-state={status.state}>
            {status.text}
          </div>
        </section>

        <section className="studio-workshop__preview">
          <div className="studio-library-heading">
            <p>Sprite Preview</p>
            <span>{selectedLabel}</span>
          </div>
          {selectedSprite?.url ? (
            <>
              <div className="studio-sprite-preview">
                <img src={selectedSprite.url} alt={`${selectedSprite.label}`} />
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
              <strong>No object sprite selected</strong>
              <p>
                Generate a custom building or object to place it in World
                Studio with a selectable footprint.
              </p>
            </div>
          )}
        </section>

        <section className="studio-workshop__library">
          <div className="studio-library-heading">
            <p>Recent Objects</p>
            <span>{objectSprites.length}</span>
          </div>
          {objectSprites.length > 0 ? (
            <div className="studio-source-texture-list">
              {objectSprites.slice(0, 18).map((sprite) => (
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
                    <small>{sprite.kind}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-library-empty">
              No Convex object sprites yet. Generated buildings and objects
              will appear here.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function normalizeObjectForm(
  form: ObjectSpritePromptMetadata
): ObjectSpritePromptMetadata {
  const label = form.label.trim();
  const rawObjectId = form.objectId.trim() || label;
  const objectId = normalizeObjectId(rawObjectId);
  const objectPrompt = form.objectPrompt.trim();
  const stylePrompt = form.stylePrompt.trim();

  if (!label) {
    throw new Error("Display name is required.");
  }

  if (!objectPrompt || !stylePrompt) {
    throw new Error("Object prompt and style prompt are required.");
  }

  return {
    objectId,
    label,
    kind: form.kind,
    region: form.region.trim(),
    habitat: form.habitat.trim(),
    objectPrompt,
    stylePrompt,
  };
}

function normalizeObjectId(value: string) {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!id) {
    throw new Error("Object ID is required.");
  }

  return id;
}

function objectRecordToPreview(
  sprite: StudioObjectSpriteRecord
): PreviewObjectSprite {
  return {
    id: sprite._id,
    objectId: sprite.objectId,
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
    updatedAt: sprite.updatedAt,
  };
}

function generatedObjectToPreview(
  sprite: GeneratedObjectSprite
): PreviewObjectSprite {
  return {
    id: sprite.spriteId,
    objectId: sprite.objectId,
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
    updatedAt: sprite.updatedAt,
  };
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "generated";
  }

  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
