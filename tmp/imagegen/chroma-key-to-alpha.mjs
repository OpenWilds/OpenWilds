import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node chroma-key-to-alpha.mjs <input.png> <output.png>");
}

const png = readFileSync(inputPath);
const signature = png.subarray(0, 8);
const expectedSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

if (!signature.equals(expectedSignature)) {
  throw new Error("Input is not a PNG");
}

let offset = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idatChunks = [];

while (offset < png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.subarray(offset + 4, offset + 8).toString("ascii");
  const data = png.subarray(offset + 8, offset + 8 + length);

  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === "IDAT") {
    idatChunks.push(data);
  } else if (type === "IEND") {
    break;
  }

  offset += 12 + length;
}

if (bitDepth !== 8 || colorType !== 2) {
  throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
}

const bytesPerPixel = 3;
const stride = width * bytesPerPixel;
const inflated = inflateSync(Buffer.concat(idatChunks));
const rgb = Buffer.alloc(width * height * bytesPerPixel);
let readOffset = 0;
let writeOffset = 0;
let previous = Buffer.alloc(stride);

for (let y = 0; y < height; y += 1) {
  const filter = inflated[readOffset];
  readOffset += 1;
  const current = Buffer.from(inflated.subarray(readOffset, readOffset + stride));
  readOffset += stride;

  for (let x = 0; x < stride; x += 1) {
    const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
    const up = previous[x];
    const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;

    if (filter === 1) {
      current[x] = (current[x] + left) & 0xff;
    } else if (filter === 2) {
      current[x] = (current[x] + up) & 0xff;
    } else if (filter === 3) {
      current[x] = (current[x] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      current[x] = (current[x] + predictor) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }

  current.copy(rgb, writeOffset);
  writeOffset += stride;
  previous = current;
}

const rgbaScanlines = Buffer.alloc(height * (1 + width * 4));
let src = 0;
let dst = 0;

for (let y = 0; y < height; y += 1) {
  rgbaScanlines[dst] = 0;
  dst += 1;

  for (let x = 0; x < width; x += 1) {
    const r = rgb[src];
    const g = rgb[src + 1];
    const b = rgb[src + 2];
    const nonGreenMax = Math.max(r, b);
    const greenDominance = g - nonGreenMax;
    const alpha =
      g > 95 && greenDominance > 34
        ? Math.max(0, Math.min(255, 255 - (greenDominance - 34) * 5))
        : 255;

    rgbaScanlines[dst] = alpha === 0 ? 0 : r;
    rgbaScanlines[dst + 1] =
      alpha < 255 ? Math.min(g, nonGreenMax + 10) : g;
    rgbaScanlines[dst + 2] = alpha === 0 ? 0 : b;
    rgbaScanlines[dst + 3] = alpha;
    src += 3;
    dst += 4;
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);

  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

writeFileSync(
  outputPath,
  Buffer.concat([
    expectedSignature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rgbaScanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ])
);
