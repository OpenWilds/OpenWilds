import Phaser from "phaser";

export const BLOB_ATLAS_CELL_SIZE = 256;

const FILLED_TILE_MASK = 255;
const CENTER_VARIANT_COLUMNS = 4;
const CENTER_VARIANT_ROWS = 4;

const BLOB_7X7_MASK_LAYOUT = [
  [11, 31, 22, 2, 254, 251, 123],
  [107, 255, 214, 66, 223, 127, 95],
  [104, 248, 208, 64, 94, 122, 222],
  [8, 24, 16, 0, 218, 91, 250],
  [106, 210, 30, 27, 10, 26, 18],
  [75, 86, 216, 120, 74, 90, 82],
  [0, 0, 219, 126, 72, 88, 80],
] as const;

export type TerrainGridLayer = {
  assetId: string;
  cells: Set<string>;
};

type AtlasSlot = {
  column: number;
  row: number;
};

let atlasSlots: Map<number, AtlasSlot> | null = null;
const initializedPrefixes = new Set<string>();

export const cellKey = (x: number, y: number) => `${x},${y}`;

export const renderAutotileLayer = (
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  layer: TerrainGridLayer,
  atlasKey: string,
  centerVariantsKey: string,
  tileSize: number,
  width: number,
  height: number
) => {
  ensureAutotileTextures(scene, layer.assetId, atlasKey, centerVariantsKey);
  container.removeAll(true);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!layer.cells.has(cellKey(x, y))) {
        continue;
      }

      const mask = getNeighborMask(layer.cells, x, y, width, height);
      const textureKey =
        mask === FILLED_TILE_MASK
          ? getCenterTextureKey(scene, layer.assetId, x, y)
          : blobTextureKey(layer.assetId, mask);
      const sprite = scene.add
        .image(x * tileSize, y * tileSize, textureKey)
        .setOrigin(0)
        .setDisplaySize(tileSize, tileSize);

      container.add(sprite);
    }
  }
};

export const blobTextureKey = (prefix: string, mask: number) =>
  `${prefix}-mask-${mask}`;

export const blobCenterVariantTextureKey = (prefix: string, variant: number) =>
  `${prefix}-center-variant-${variant}`;

function buildBlobAtlasSlotLookup() {
  const slots = new Map<number, AtlasSlot>();

  BLOB_7X7_MASK_LAYOUT.forEach((rowMasks, row) => {
    rowMasks.forEach((mask, column) => {
      if (!slots.has(mask)) {
        slots.set(mask, { column, row });
      }
    });
  });

  return slots;
}

function getBlobAtlasSlots() {
  atlasSlots ??= buildBlobAtlasSlotLookup();

  return atlasSlots;
}

const ensureAutotileTextures = (
  scene: Phaser.Scene,
  texturePrefix: string,
  atlasKey: string,
  centerVariantsKey: string
) => {
  if (initializedPrefixes.has(texturePrefix)) {
    return;
  }

  const source = scene.textures.get(atlasKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;

  for (const [mask, slot] of getBlobAtlasSlots()) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = BLOB_ATLAS_CELL_SIZE;
    canvas.height = BLOB_ATLAS_CELL_SIZE;

    if (!context) {
      continue;
    }

    context.drawImage(
      source,
      slot.column * BLOB_ATLAS_CELL_SIZE,
      slot.row * BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE,
      0,
      0,
      BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE
    );

    const imageData = context.getImageData(
      0,
      0,
      BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE
    );
    const pixels = imageData.data;

    for (let index = 0; index < pixels.length; index += 4) {
      if (
        isSheetBackground(pixels[index], pixels[index + 1], pixels[index + 2])
      ) {
        pixels[index + 3] = 0;
      }
    }

    context.putImageData(imageData, 0, 0);

    const key = blobTextureKey(texturePrefix, mask);
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
    scene.textures.addCanvas(key, canvas);
  }

  ensureCenterVariantTextures(scene, texturePrefix, centerVariantsKey);
  initializedPrefixes.add(texturePrefix);
};

const ensureCenterVariantTextures = (
  scene: Phaser.Scene,
  texturePrefix: string,
  centerVariantsKey: string
) => {
  const source = scene.textures.get(centerVariantsKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const variantCount = CENTER_VARIANT_COLUMNS * CENTER_VARIANT_ROWS;

  for (let variant = 0; variant < variantCount; variant += 1) {
    const column = variant % CENTER_VARIANT_COLUMNS;
    const row = Math.floor(variant / CENTER_VARIANT_COLUMNS);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = BLOB_ATLAS_CELL_SIZE;
    canvas.height = BLOB_ATLAS_CELL_SIZE;

    if (!context) {
      continue;
    }

    context.drawImage(
      source,
      column * BLOB_ATLAS_CELL_SIZE,
      row * BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE,
      0,
      0,
      BLOB_ATLAS_CELL_SIZE,
      BLOB_ATLAS_CELL_SIZE
    );

    const key = blobCenterVariantTextureKey(texturePrefix, variant);
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
    scene.textures.addCanvas(key, canvas);
  }
};

const getCenterTextureKey = (
  scene: Phaser.Scene,
  texturePrefix: string,
  x: number,
  y: number
) => {
  const variant = hashVariant(
    x,
    y,
    CENTER_VARIANT_COLUMNS * CENTER_VARIANT_ROWS
  );
  const variantKey = blobCenterVariantTextureKey(texturePrefix, variant);

  return scene.textures.exists(variantKey)
    ? variantKey
    : blobTextureKey(texturePrefix, FILLED_TILE_MASK);
};

const getNeighborMask = (
  cells: Set<string>,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const has = (cellX: number, cellY: number) =>
    cellX >= 0 &&
    cellY >= 0 &&
    cellX < width &&
    cellY < height &&
    cells.has(cellKey(cellX, cellY));
  const n = has(x, y - 1);
  const e = has(x + 1, y);
  const s = has(x, y + 1);
  const w = has(x - 1, y);
  const ne = n && e && has(x + 1, y - 1);
  const se = s && e && has(x + 1, y + 1);
  const sw = s && w && has(x - 1, y + 1);
  const nw = n && w && has(x - 1, y - 1);

  let mask = 0;
  mask |= se ? 1 << 0 : 0;
  mask |= s ? 1 << 1 : 0;
  mask |= sw ? 1 << 2 : 0;
  mask |= e ? 1 << 3 : 0;
  mask |= w ? 1 << 4 : 0;
  mask |= ne ? 1 << 5 : 0;
  mask |= n ? 1 << 6 : 0;
  mask |= nw ? 1 << 7 : 0;

  return mask;
};

const isSheetBackground = (red: number, green: number, blue: number) => {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  return max - min < 18 && red > 90 && green > 90 && blue > 90;
};

const hashVariant = (x: number, y: number, variants: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  const normalized = value - Math.floor(value);

  return Math.floor(normalized * variants) % variants;
};
