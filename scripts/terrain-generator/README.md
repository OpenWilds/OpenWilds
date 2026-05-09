# Terrain Studio

Run the Phaser studio:

```sh
npm run studio
```

Open `/studio`.

The Terrain Workshop uses the migrated Pantheon dual-grid terrain generator in
`app/src/studio/terrain-generator.ts`. Designers can:

1. Fill in terrain name, id, material, texture, and style.
2. Copy the generated source-texture prompt into an image tool.
3. Save the returned seamless square texture as PNG.
4. Load that PNG in the studio and choose `Build Terrain`.
5. Paint maps with the generated terrain immediately.
6. Export JSON. Generated terrain atlases are embedded in `terrainAssets`, so
   importing the map restores the custom palette.

The browser API is `generateTerrainAsset(request)`. It returns a
`TerrainVisualAsset` with a 7x7 blob autotile atlas and 4x4 center variants as
PNG data URLs.
