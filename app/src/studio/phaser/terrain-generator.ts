import leftBottomMaskUrl from "../../assets/autotile-masks/land-grid-map-left-bottom.png?url";
import leftTopMaskUrl from "../../assets/autotile-masks/land-grid-map-left-top.png?url";
import rightBottomMaskUrl from "../../assets/autotile-masks/land-grid-map-right-bottom.png?url";
import rightTopAMaskUrl from "../../assets/autotile-masks/land-grid-map-right-top-a.png?url";
import rightTopBMaskUrl from "../../assets/autotile-masks/land-grid-map-right-top-b.png?url";
import type { TerrainVisualAsset } from "../../assets/visual-assets";

export const TERRAIN_GENERATOR_TILE_SIZE = 256;
const CONTEXT_GRID_SIZE = 4;
const CONTEXT_IMAGE_SIZE = CONTEXT_GRID_SIZE * TERRAIN_GENERATOR_TILE_SIZE;
const ATLAS_COLUMNS = 7;
const ATLAS_ROWS = 7;

type MaskDefinition = {
  id:
    | "left-top"
    | "right-top-a"
    | "right-top-b"
    | "left-bottom"
    | "right-bottom";
  title: string;
  url: string;
  sourceGridSize: 3 | 4;
  gridOffsetColumn: number;
  gridOffsetRow: number;
};

type Placement = {
  input: HTMLCanvasElement;
  sourceGridSize: number;
  sourceColumn: number;
  sourceRow: number;
  outputColumn: number;
  outputRow: number;
};

export type TerrainGeneratorRequest = {
  terrainId: string;
  label: string;
  material: string;
  texturePrompt: string;
  stylePrompt: string;
  sourceTexture: File | Blob | HTMLImageElement | HTMLCanvasElement;
};

export type GeneratedTerrainAsset = TerrainVisualAsset & {
  material: string;
  texturePrompt: string;
  stylePrompt: string;
  generatedAt: string;
};

const maskDefinitions: MaskDefinition[] = [
  {
    id: "left-top",
    title: "Left Top autotile mask sheet",
    url: leftTopMaskUrl,
    sourceGridSize: 4,
    gridOffsetColumn: 0,
    gridOffsetRow: 0,
  },
  {
    id: "right-top-a",
    title: "Right Top A autotile mask sheet",
    url: rightTopAMaskUrl,
    sourceGridSize: 3,
    gridOffsetColumn: 1,
    gridOffsetRow: 0,
  },
  {
    id: "right-top-b",
    title: "Right Top B autotile mask sheet",
    url: rightTopBMaskUrl,
    sourceGridSize: 3,
    gridOffsetColumn: 1,
    gridOffsetRow: 0,
  },
  {
    id: "left-bottom",
    title: "Left Bottom autotile mask sheet",
    url: leftBottomMaskUrl,
    sourceGridSize: 4,
    gridOffsetColumn: 0,
    gridOffsetRow: 0,
  },
  {
    id: "right-bottom",
    title: "Right Bottom autotile mask sheet",
    url: rightBottomMaskUrl,
    sourceGridSize: 3,
    gridOffsetColumn: 1,
    gridOffsetRow: 1,
  },
];

export async function generateTerrainAsset(
  request: TerrainGeneratorRequest
): Promise<GeneratedTerrainAsset> {
  const id = normalizeTerrainId(request.terrainId);
  const sourceImage = await loadSourceImage(request.sourceTexture);
  const sourceTexture = createSourceTextureReference(sourceImage);
  const centerVariants = canvasToDataUrl(sourceTexture);
  const segments = new Map<string, HTMLCanvasElement>();

  for (const mask of maskDefinitions) {
    const maskImage = await loadImage(mask.url);
    const maskReference = createMaskReference(maskImage, mask);
    segments.set(
      mask.id,
      compositeAutotileMaskSheet(sourceTexture, maskReference)
    );
  }

  const atlas = combineAutotileAtlas(segments);

  return {
    id,
    label: request.label.trim() || titleCase(id),
    atlasUrl: canvasToDataUrl(atlas),
    centerVariantsUrl: centerVariants,
    generated: true,
    material: request.material.trim(),
    texturePrompt: request.texturePrompt.trim(),
    stylePrompt: request.stylePrompt.trim(),
    generatedAt: new Date().toISOString(),
  };
}

export function buildTerrainTexturePrompt(args: {
  material: string;
  texturePrompt: string;
  stylePrompt: string;
}) {
  return [
    `Create one seamless square terrain source texture for ${args.material}.`,
    "",
    `Texture brief: ${args.texturePrompt}.`,
    `Style direction: ${args.stylePrompt}.`,
    "",
    "This image will be used as the exact source texture for a 47-tile dual-grid autotile generator.",
    "Make a single flat top-down material swatch, not a tile sheet, not a map, and not a scene.",
    "The texture must be seamless or near-seamless on all four edges.",
    "Use consistent visual density across the entire square.",
    "Avoid large unique focal elements, landmarks, symbols, logos, text, UI, borders, frames, cast shadows, perspective objects, or lighting gradients.",
    "Keep the material readable when cropped into many 256px terrain tiles.",
    "Return one square PNG only.",
  ].join("\n");
}

function createSourceTextureReference(source: CanvasImageSource) {
  const canvas = createCanvas(CONTEXT_IMAGE_SIZE, CONTEXT_IMAGE_SIZE);
  const context = getContext(canvas);

  for (let row = 0; row < CONTEXT_GRID_SIZE; row += 1) {
    for (let column = 0; column < CONTEXT_GRID_SIZE; column += 1) {
      context.drawImage(
        source,
        column * TERRAIN_GENERATOR_TILE_SIZE,
        row * TERRAIN_GENERATOR_TILE_SIZE,
        TERRAIN_GENERATOR_TILE_SIZE,
        TERRAIN_GENERATOR_TILE_SIZE
      );
    }
  }

  return canvas;
}

function createMaskReference(source: HTMLImageElement, mask: MaskDefinition) {
  const canvas = createCanvas(CONTEXT_IMAGE_SIZE, CONTEXT_IMAGE_SIZE);
  const context = getContext(canvas);

  context.fillStyle = "rgb(184, 184, 184)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    mask.gridOffsetColumn * TERRAIN_GENERATOR_TILE_SIZE,
    mask.gridOffsetRow * TERRAIN_GENERATOR_TILE_SIZE,
    mask.sourceGridSize * TERRAIN_GENERATOR_TILE_SIZE,
    mask.sourceGridSize * TERRAIN_GENERATOR_TILE_SIZE
  );

  return canvas;
}

function compositeAutotileMaskSheet(
  textureReference: HTMLCanvasElement,
  maskReference: HTMLCanvasElement
) {
  const canvas = createCanvas(CONTEXT_IMAGE_SIZE, CONTEXT_IMAGE_SIZE);
  const context = getContext(canvas);
  const maskContext = getContext(maskReference);
  const textureContext = getContext(textureReference);
  const maskImage = maskContext.getImageData(0, 0, canvas.width, canvas.height);
  const textureImage = textureContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );
  const output = context.createImageData(canvas.width, canvas.height);

  for (let index = 0; index < output.data.length; index += 4) {
    const red = maskImage.data[index];
    const green = maskImage.data[index + 1];
    const blue = maskImage.data[index + 2];
    const alpha = getRedMaskAlpha(red, green, blue);

    if (alpha > 0) {
      output.data[index] = textureImage.data[index];
      output.data[index + 1] = textureImage.data[index + 1];
      output.data[index + 2] = textureImage.data[index + 2];
      output.data[index + 3] = 255;
      continue;
    }

    output.data[index] = red;
    output.data[index + 1] = green;
    output.data[index + 2] = blue;
    output.data[index + 3] = 255;
  }

  context.putImageData(output, 0, 0);
  return canvas;
}

function combineAutotileAtlas(segments: Map<string, HTMLCanvasElement>) {
  const atlas = createCanvas(
    ATLAS_COLUMNS * TERRAIN_GENERATOR_TILE_SIZE,
    ATLAS_ROWS * TERRAIN_GENERATOR_TILE_SIZE
  );
  const context = getContext(atlas);
  const required = (id: string) => {
    const segment = segments.get(id);

    if (!segment) {
      throw new Error(`Missing generated autotile segment: ${id}`);
    }

    return segment;
  };
  const placements: Placement[] = [
    ...createGridPlacements(required("left-top"), 4, 0, 0, 4, 4),
    ...createGridPlacements(required("right-top-a"), 4, 4, 0, 3, 3, 1, 0),
    ...createGridPlacements(required("right-top-b"), 4, 4, 3, 3, 1, 1, 1),
    ...createGridPlacements(required("left-bottom"), 4, 0, 4, 4, 3),
    ...createGridPlacements(required("right-bottom"), 4, 4, 4, 3, 3, 1, 1),
  ];

  for (const placement of placements) {
    context.drawImage(
      placement.input,
      placement.sourceColumn * TERRAIN_GENERATOR_TILE_SIZE,
      placement.sourceRow * TERRAIN_GENERATOR_TILE_SIZE,
      TERRAIN_GENERATOR_TILE_SIZE,
      TERRAIN_GENERATOR_TILE_SIZE,
      placement.outputColumn * TERRAIN_GENERATOR_TILE_SIZE,
      placement.outputRow * TERRAIN_GENERATOR_TILE_SIZE,
      TERRAIN_GENERATOR_TILE_SIZE,
      TERRAIN_GENERATOR_TILE_SIZE
    );
  }

  return atlas;
}

function createGridPlacements(
  input: HTMLCanvasElement,
  sourceGridSize: number,
  outputColumnStart: number,
  outputRowStart: number,
  columns: number,
  rows: number,
  sourceColumnStart = 0,
  sourceRowStart = 0
): Placement[] {
  const placements: Placement[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      placements.push({
        input,
        sourceGridSize,
        sourceColumn: sourceColumnStart + column,
        sourceRow: sourceRowStart + row,
        outputColumn: outputColumnStart + column,
        outputRow: outputRowStart + row,
      });
    }
  }

  return placements;
}

function getRedMaskAlpha(red: number, green: number, blue: number) {
  const dominance = red - Math.max(green, blue);

  if (red < 120 || dominance <= 24) {
    return 0;
  }

  return Math.min(Math.max((dominance - 24) / 96, 0), 1);
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  return context;
}

async function loadSourceImage(
  source: File | Blob | HTMLImageElement | HTMLCanvasElement
) {
  if (
    source instanceof HTMLImageElement ||
    source instanceof HTMLCanvasElement
  ) {
    return source;
  }

  const url = URL.createObjectURL(source);

  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${url}`));
    image.src = url;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

export function normalizeTerrainId(value: string) {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!id) {
    throw new Error("Terrain id is required.");
  }

  return id;
}

function titleCase(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
