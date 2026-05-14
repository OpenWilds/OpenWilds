"use node";

import { Buffer } from "node:buffer";
import { deflateSync, inflateSync } from "node:zlib";

import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  leftBottomMaskPngBase64,
  leftTopMaskPngBase64,
  rightBottomMaskPngBase64,
  rightTopAMaskPngBase64,
  rightTopBMaskPngBase64,
} from "./studioTerrainAutotileMasks";

const terrainStatus = v.union(
  v.literal("draft"),
  v.literal("library"),
  v.literal("archived")
);

const TILE_SIZE = 256;
const CONTEXT_GRID_SIZE = 4;
const CONTEXT_IMAGE_SIZE = CONTEXT_GRID_SIZE * TILE_SIZE;
const ATLAS_COLUMNS = 7;
const ATLAS_ROWS = 7;

type PngImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

type MaskReference = {
  id:
    | "left-top"
    | "right-top-a"
    | "right-top-b"
    | "left-bottom"
    | "right-bottom";
  image: PngImage;
};

type Placement = {
  input: PngImage;
  sourceColumn: number;
  sourceRow: number;
  outputColumn: number;
  outputRow: number;
};

const pngSignature = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const maskReferences: MaskReference[] = [
  {
    id: "left-top",
    image: readPng(Buffer.from(leftTopMaskPngBase64, "base64")),
  },
  {
    id: "right-top-a",
    image: readPng(Buffer.from(rightTopAMaskPngBase64, "base64")),
  },
  {
    id: "right-top-b",
    image: readPng(Buffer.from(rightTopBMaskPngBase64, "base64")),
  },
  {
    id: "left-bottom",
    image: readPng(Buffer.from(leftBottomMaskPngBase64, "base64")),
  },
  {
    id: "right-bottom",
    image: readPng(Buffer.from(rightBottomMaskPngBase64, "base64")),
  },
];

export const buildTerrainAsset = action({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    sourceTextureId: v.id("studioTerrainTextures"),
    terrainId: v.string(),
    label: v.string(),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    status: v.optional(terrainStatus),
    tags: v.optional(v.array(v.string())),
    walkable: v.optional(v.boolean()),
    plantable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sourceTexture = await ctx.runQuery(
      internal.studioTerrainBuildData.getSourceTextureForBuild,
      {
        workspaceId: args.workspaceId,
        sourceTextureId: args.sourceTextureId,
      }
    );
    const sourceBlob = await ctx.storage.get(sourceTexture.storageId);

    if (!sourceBlob) {
      throw new Error("Source texture storage file not found");
    }

    const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
    const generated = buildTerrainPngs(sourceBytes);
    const [atlasStorageId, centerVariantsStorageId] = await Promise.all([
      ctx.storage.store(
        new Blob([generated.atlas], {
          type: "image/png",
        })
      ),
      ctx.storage.store(
        new Blob([generated.centerVariants], {
          type: "image/png",
        })
      ),
    ]);
    const terrainAssetId: Id<"studioTerrainAssets"> = await ctx.runMutation(
      api.studio.registerTerrainAsset,
      {
        workspaceId: args.workspaceId,
        terrainId: args.terrainId,
        label: args.label,
        sourceTextureId: args.sourceTextureId,
        atlasStorageId,
        centerVariantsStorageId,
        material: args.material,
        texturePrompt: args.texturePrompt,
        stylePrompt: args.stylePrompt,
        status: args.status ?? "library",
        tags: args.tags ?? [],
        walkable: args.walkable ?? true,
        plantable: args.plantable ?? true,
      }
    );

    return {
      terrainAssetId,
      workspaceId: args.workspaceId,
      sourceTextureId: args.sourceTextureId,
      atlasStorageId,
      centerVariantsStorageId,
      atlasUrl: await ctx.storage.getUrl(atlasStorageId),
      centerVariantsUrl: await ctx.storage.getUrl(centerVariantsStorageId),
      terrainId: args.terrainId,
      label: args.label,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "library",
      tags: args.tags ?? [],
      walkable: args.walkable ?? true,
      plantable: args.plantable ?? true,
      generatedAt: Date.now(),
    };
  },
});

function buildTerrainPngs(sourceBytes: Uint8Array) {
  const source = readPng(sourceBytes);
  const tile = resizePng(source, TILE_SIZE, TILE_SIZE, "bilinear");
  const sourceReference = createPng(CONTEXT_IMAGE_SIZE, CONTEXT_IMAGE_SIZE);
  const segments = new Map<string, PngImage>();

  for (let row = 0; row < CONTEXT_GRID_SIZE; row += 1) {
    for (let column = 0; column < CONTEXT_GRID_SIZE; column += 1) {
      drawPng(
        tile,
        sourceReference,
        column * TILE_SIZE,
        row * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }

  for (const mask of maskReferences) {
    segments.set(
      mask.id,
      compositeAutotileMaskSheet(sourceReference, mask.image)
    );
  }

  const atlas = combineAutotileAtlas(segments);

  return {
    atlas: writePng(atlas),
    centerVariants: writePng(sourceReference),
  };
}

function createPng(width: number, height: number, fill = [0, 0, 0, 0]) {
  const data = new Uint8Array(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = fill[3];
  }

  return { width, height, data };
}

function resizePng(
  source: PngImage,
  width: number,
  height: number,
  mode: "nearest" | "bilinear" = "nearest"
) {
  const output = createPng(width, height);
  drawPng(source, output, 0, 0, width, height, mode);
  return output;
}

function drawPng(
  source: PngImage,
  target: PngImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mode: "nearest" | "bilinear" = "nearest"
) {
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const sourceX = ((x + 0.5) * source.width) / dw - 0.5;
      const sourceY = ((y + 0.5) * source.height) / dh - 0.5;
      const pixel =
        mode === "bilinear"
          ? sampleBilinear(source, sourceX, sourceY)
          : getPixel(
              source,
              clamp(Math.round(sourceX), 0, source.width - 1),
              clamp(Math.round(sourceY), 0, source.height - 1)
            );
      setPixel(target, dx + x, dy + y, pixel);
    }
  }
}

function sampleBilinear(source: PngImage, x: number, y: number) {
  const x0 = clamp(Math.floor(x), 0, source.width - 1);
  const y0 = clamp(Math.floor(y), 0, source.height - 1);
  const x1 = clamp(x0 + 1, 0, source.width - 1);
  const y1 = clamp(y0 + 1, 0, source.height - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const p00 = getPixel(source, x0, y0);
  const p10 = getPixel(source, x1, y0);
  const p01 = getPixel(source, x0, y1);
  const p11 = getPixel(source, x1, y1);

  return [0, 1, 2, 3].map((channel) => {
    const top = p00[channel] * (1 - tx) + p10[channel] * tx;
    const bottom = p01[channel] * (1 - tx) + p11[channel] * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
  });
}

function compositeAutotileMaskSheet(
  textureReference: PngImage,
  maskReference: PngImage
) {
  const output = createPng(CONTEXT_IMAGE_SIZE, CONTEXT_IMAGE_SIZE);

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const mask = getPixel(maskReference, x, y);
      const alpha = getRedMaskAlpha(mask[0], mask[1], mask[2]);
      setPixel(
        output,
        x,
        y,
        alpha > 0 ? getPixel(textureReference, x, y) : mask
      );
      setAlpha(output, x, y, 255);
    }
  }

  return output;
}

function combineAutotileAtlas(segments: Map<string, PngImage>) {
  const atlas = createPng(ATLAS_COLUMNS * TILE_SIZE, ATLAS_ROWS * TILE_SIZE);
  const required = (id: string) => {
    const segment = segments.get(id);

    if (!segment) {
      throw new Error(`Missing generated autotile segment: ${id}`);
    }

    return segment;
  };
  const placements: Placement[] = [
    ...gridPlacements(required("left-top"), 0, 0, 4, 4),
    ...gridPlacements(required("right-top-a"), 4, 0, 3, 3, 1, 0),
    ...gridPlacements(required("right-top-b"), 4, 3, 3, 1, 1, 1),
    ...gridPlacements(required("left-bottom"), 0, 4, 4, 3),
    ...gridPlacements(required("right-bottom"), 4, 4, 3, 3, 1, 1),
  ];

  for (const placement of placements) {
    copyPngRegion(
      placement.input,
      atlas,
      placement.sourceColumn * TILE_SIZE,
      placement.sourceRow * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
      placement.outputColumn * TILE_SIZE,
      placement.outputRow * TILE_SIZE
    );
  }

  return atlas;
}

function gridPlacements(
  input: PngImage,
  outputColumnStart: number,
  outputRowStart: number,
  columns: number,
  rows: number,
  sourceColumnStart = 0,
  sourceRowStart = 0
) {
  const placements: Placement[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      placements.push({
        input,
        sourceColumn: sourceColumnStart + column,
        sourceRow: sourceRowStart + row,
        outputColumn: outputColumnStart + column,
        outputRow: outputRowStart + row,
      });
    }
  }

  return placements;
}

function copyPngRegion(
  source: PngImage,
  target: PngImage,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number
) {
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      setPixel(target, dx + x, dy + y, getPixel(source, sx + x, sy + y));
    }
  }
}

function getPixel(png: PngImage, x: number, y: number) {
  const index = (png.width * y + x) * 4;
  return [
    png.data[index],
    png.data[index + 1],
    png.data[index + 2],
    png.data[index + 3],
  ];
}

function setPixel(png: PngImage, x: number, y: number, pixel: number[]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }

  const index = (png.width * y + x) * 4;
  png.data[index] = pixel[0];
  png.data[index + 1] = pixel[1];
  png.data[index + 2] = pixel[2];
  png.data[index + 3] = pixel[3];
}

function setAlpha(png: PngImage, x: number, y: number, alpha: number) {
  const index = (png.width * y + x) * 4;
  png.data[index + 3] = alpha;
}

function getRedMaskAlpha(red: number, green: number, blue: number) {
  const dominance = red - Math.max(green, blue);

  if (red < 120 || dominance <= 24) {
    return 0;
  }

  return Math.min(Math.max((dominance - 24) / 96, 0), 1);
}

function readPng(bytes: Uint8Array): PngImage {
  assertPngSignature(bytes);

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idatChunks: Uint8Array[] = [];

  while (offset < bytes.length) {
    const length = readUint32(bytes, offset);
    offset += 4;
    const type = ascii(bytes.subarray(offset, offset + 4));
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  }

  const channels = channelsForColorType(colorType);
  const inflated = inflateSync(Buffer.concat(idatChunks.map(Buffer.from)));
  const scanlineLength = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let inputOffset = 0;
  let previous = new Uint8Array(scanlineLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const current = new Uint8Array(
      inflated.subarray(inputOffset, inputOffset + scanlineLength)
    );
    inputOffset += scanlineLength;
    unfilterScanline(current, previous, channels, filter);
    writeRgbaRow(rgba, y, width, current, colorType, palette, transparency);
    previous = current;
  }

  return { width, height, data: rgba };
}

function writePng(png: PngImage) {
  const stride = png.width * 4;
  const raw = Buffer.alloc((stride + 1) * png.height);

  for (let y = 0; y < png.height; y += 1) {
    const rawOffset = y * (stride + 1);
    const dataOffset = y * stride;
    raw[rawOffset] = 0;
    Buffer.from(png.data.buffer, png.data.byteOffset + dataOffset, stride).copy(
      raw,
      rawOffset + 1
    );
  }

  return Buffer.concat([
    Buffer.from(pngSignature),
    pngChunk("IHDR", createIhdr(png.width, png.height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function unfilterScanline(
  current: Uint8Array,
  previous: Uint8Array,
  bytesPerPixel: number,
  filter: number
) {
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;

    if (filter === 1) {
      current[index] = (current[index] + left) & 0xff;
    } else if (filter === 2) {
      current[index] = (current[index] + up) & 0xff;
    } else if (filter === 3) {
      current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      current[index] = (current[index] + paeth(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }
}

function writeRgbaRow(
  target: Uint8Array,
  row: number,
  width: number,
  source: Uint8Array,
  colorType: number,
  palette: Uint8Array | null,
  transparency: Uint8Array | null
) {
  for (let x = 0; x < width; x += 1) {
    const targetOffset = (row * width + x) * 4;

    if (colorType === 6) {
      const sourceOffset = x * 4;
      target[targetOffset] = source[sourceOffset];
      target[targetOffset + 1] = source[sourceOffset + 1];
      target[targetOffset + 2] = source[sourceOffset + 2];
      target[targetOffset + 3] = source[sourceOffset + 3];
    } else if (colorType === 2) {
      const sourceOffset = x * 3;
      target[targetOffset] = source[sourceOffset];
      target[targetOffset + 1] = source[sourceOffset + 1];
      target[targetOffset + 2] = source[sourceOffset + 2];
      target[targetOffset + 3] = 255;
    } else if (colorType === 0) {
      const value = source[x];
      target[targetOffset] = value;
      target[targetOffset + 1] = value;
      target[targetOffset + 2] = value;
      target[targetOffset + 3] = 255;
    } else if (colorType === 4) {
      const sourceOffset = x * 2;
      const value = source[sourceOffset];
      target[targetOffset] = value;
      target[targetOffset + 1] = value;
      target[targetOffset + 2] = value;
      target[targetOffset + 3] = source[sourceOffset + 1];
    } else if (colorType === 3) {
      if (!palette) {
        throw new Error("Palette PNG is missing PLTE data.");
      }
      const paletteIndex = source[x];
      const paletteOffset = paletteIndex * 3;
      target[targetOffset] = palette[paletteOffset] ?? 0;
      target[targetOffset + 1] = palette[paletteOffset + 1] ?? 0;
      target[targetOffset + 2] = palette[paletteOffset + 2] ?? 0;
      target[targetOffset + 3] = transparency?.[paletteIndex] ?? 255;
    }
  }
}

function channelsForColorType(colorType: number) {
  if (colorType === 0 || colorType === 3) {
    return 1;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 6) {
    return 4;
  }
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function assertPngSignature(bytes: Uint8Array) {
  for (let index = 0; index < pngSignature.length; index += 1) {
    if (bytes[index] !== pngSignature[index]) {
      throw new Error("Input is not a PNG.");
    }
  }
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function ascii(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
