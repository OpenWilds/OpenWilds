# Terrain Studio

Run the Phaser studio:

```sh
npm run studio
```

Open `/studio`.

The Terrain Workshop uses Convex for shared storage and the migrated Pantheon
texture/autotile flow. Designers can:

1. Fill in terrain name, id, material, texture, and style.
2. Choose `Generate Texture` to ask Convex to create a seamless square source
   texture through OpenRouter.
3. Approve the texture preview.
4. Choose `Build Terrain` to turn that source texture into a 47-tile autotile
   set.
5. Paint maps with the generated terrain immediately.
6. Save maps and shared terrain through Convex, or export JSON for handoff.

Required local/browser env:

```sh
VITE_CONVEX_URL=...
```

Required Convex env:

```sh
OPENROUTER_API_KEY=...
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
OPENROUTER_REASONING_EFFORT=high
```

The browser autotile API is `generateTerrainAsset(request)`. It returns a
`TerrainVisualAsset` with a 7x7 blob autotile atlas and 4x4 center variants.
The Convex action `studio:generateSourceTexture` owns AI source-texture
generation so API keys never enter the browser.
