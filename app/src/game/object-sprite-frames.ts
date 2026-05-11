import Phaser from "phaser";
import {
  OBJECT_SPRITE_ASSETS,
  objectSpriteKey,
  type ObjectSpriteAssetId,
} from "../assets/visual-assets";
import { FARM_TYPES, FarmItemId } from "./farm";
import { ItemId } from "./terrain";

export type SpriteFrameRef = {
  assetId: ObjectSpriteAssetId;
  frame: number;
};

export type ObjectSpriteFrameTexture = {
  key: string;
  width: number;
  height: number;
};

export const getObjectSpriteFrameTexture = (
  scene: Phaser.Scene,
  assetId: ObjectSpriteAssetId,
  frame: number
): ObjectSpriteFrameTexture => {
  const asset = OBJECT_SPRITE_ASSETS[assetId];
  const sourceTextureKey = objectSpriteKey(assetId);
  const boundedFrame = Phaser.Math.Clamp(
    Math.floor(frame),
    0,
    asset.rows * asset.columns - 1
  );
  const variantKey = `${sourceTextureKey}-variant-${boundedFrame}`;
  const crop = getObjectSpriteFrameCrop(scene, assetId, boundedFrame);

  if (scene.textures.exists(variantKey)) {
    return {
      key: variantKey,
      width: crop.width,
      height: crop.height,
    };
  }

  // Mirrors the studio map editor: crop from the actual PNG dimensions rather
  // than the declared metadata frame size.
  const source = scene.textures
    .get(sourceTextureKey)
    .getSourceImage() as CanvasImageSource;
  const texture = scene.textures.createCanvas(
    variantKey,
    crop.width,
    crop.height
  );

  if (!texture) {
    return {
      key: sourceTextureKey,
      width: crop.width,
      height: crop.height,
    };
  }

  const context = texture.getContext();
  context.clearRect(0, 0, crop.width, crop.height);
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  texture.refresh();

  return {
    key: variantKey,
    width: crop.width,
    height: crop.height,
  };
};

export const getItemSpriteFrame = (itemId: number): SpriteFrameRef => {
  const farm = FARM_TYPES.find(
    (candidate) =>
      candidate.seedItemId === itemId ||
      candidate.harvestItemId === itemId ||
      candidate.chopItemId === itemId
  );

  if (farm) {
    const columns = OBJECT_SPRITE_ASSETS[farm.spriteAssetId].columns;
    if (farm.seedItemId === itemId) {
      return { assetId: farm.spriteAssetId, frame: 0 };
    }

    if (farm.harvestItemId === itemId) {
      return { assetId: farm.spriteAssetId, frame: 3 * columns + 1 };
    }

    return { assetId: farm.spriteAssetId, frame: 3 * columns + 2 };
  }

  switch (itemId) {
    case ItemId.berry:
      return { assetId: "routeberry", frame: 13 };
    case ItemId.grassFiber:
      return { assetId: "city-clover", frame: 13 };
    case ItemId.stone:
      return { assetId: "stonepine", frame: 14 };
    case ItemId.reed:
      return { assetId: "routeberry", frame: 12 };
    case FarmItemId.wood:
    case FarmItemId.oakLog:
      return { assetId: "stonepine", frame: 14 };
    default:
      return { assetId: "city-clover", frame: 0 };
  }
};

const getObjectSpriteFrameCrop = (
  scene: Phaser.Scene,
  assetId: ObjectSpriteAssetId,
  frame: number
) => {
  const asset = OBJECT_SPRITE_ASSETS[assetId];
  const texture = scene.textures.get(objectSpriteKey(assetId));
  const source = texture.getSourceImage() as {
    width?: number;
    height?: number;
  };
  const textureWidth = Number(source?.width) || asset.columns * asset.frameSize;
  const textureHeight = Number(source?.height) || asset.rows * asset.frameSize;
  const frameWidth = textureWidth / asset.columns;
  const frameHeight = textureHeight / asset.rows;
  const boundedFrame = Phaser.Math.Clamp(
    frame,
    0,
    asset.rows * asset.columns - 1
  );
  const column = boundedFrame % asset.columns;
  const row = Math.floor(boundedFrame / asset.columns);

  return {
    x: Math.round(column * frameWidth),
    y: Math.round(row * frameHeight),
    width: Math.round(frameWidth),
    height: Math.round(frameHeight),
  };
};
