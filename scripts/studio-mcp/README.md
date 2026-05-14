# Studio MCP Server

Run the local MCP server with:

```sh
npm run studio:mcp
```

The server reads `VITE_CONVEX_URL` from `.env.local`, or you can set
`OPEN_WILDS_STUDIO_CONVEX_URL`.

Authentication is Convex Auth:

- Use the `studio_sign_in` MCP tool with the local email/password provider.
- Or launch the server with `OPEN_WILDS_STUDIO_AUTH_TOKEN=<convex-jwt>`.

The server never bypasses Studio workspace permissions. Convex still enforces
viewer, editor, admin, and owner role checks.

## Client Example

```json
{
  "mcpServers": {
    "open-wilds-studio": {
      "command": "npm",
      "args": ["run", "studio:mcp"],
      "cwd": "/Users/ajand/Projects/solana/open-wilds"
    }
  }
}
```

## Tool Surface

The MCP server exposes:

- Auth tools: status, sign in, sign out.
- Workspace tools: create/list/get, roles, members, invites.
- Texture tools: generate/list/register source textures.
- Terrain tools: build/register/list terrain assets and end-to-end
  texture-to-terrain generation.
- Plant tools: generate/register/list plant and tree sprites.
- Object tools: generate/register/list object and building sprites.
- World tools: save and list Studio maps.

The terrain builder calls the Convex `studioTerrainBuild:buildTerrainAsset`
action. That action owns the PNG compositor, stores the 7x7 autotile atlas and
4x4 center variants in Convex storage, and registers the terrain asset in the
workspace.
