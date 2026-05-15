# Studio MCP Server

Run the local MCP server with:

```sh
npm run studio:mcp
```

For public installs, use:

```sh
npx -y @open-wilds/studio-mcp
```

The server reads `VITE_CONVEX_URL` from `.env.local`, or you can set
`OPEN_WILDS_STUDIO_CONVEX_URL`.

Authentication is Convex Auth:

- For local Codex development, copy a short-lived token env line from Studio's
  workspace panel, then pass it as `OPEN_WILDS_STUDIO_AUTH_TOKEN`.
- Use the `studio_sign_in` MCP tool with the local email/password provider.
- Or call `studio_login_browser` to open Studio and capture a browser session
  through a localhost callback. This is experimental for local stdio clients.

The server never bypasses Studio workspace permissions. Convex still enforces
viewer, editor, admin, and owner role checks.

## Client Example

For Codex local testing without publishing a package:

1. Start Studio and sign in:

   ```sh
   cd /Users/ajand/Projects/solana/open-wilds
   npm run studio
   ```

2. Open `http://localhost:5173/studio`, open the workspace panel, and use
   `MCP Access` to copy the `OPEN_WILDS_STUDIO_AUTH_TOKEN=...` env line.

3. Register the local server with Codex:

   ```sh
   codex mcp remove open-wilds-studio-local

   codex mcp add open-wilds-studio-local \
     --env OPEN_WILDS_STUDIO_CONVEX_URL=https://first-warthog-31.convex.cloud \
     --env OPEN_WILDS_STUDIO_URL=http://localhost:5173/studio \
     --env OPEN_WILDS_STUDIO_MCP_ROOT=/Users/ajand/Projects/solana/open-wilds \
     --env OPEN_WILDS_STUDIO_AUTH_TOKEN='<paste-token-here>' \
     -- node /Users/ajand/Projects/solana/open-wilds/packages/open-wilds-studio-mcp/bin/open-wilds-studio-mcp.mjs
   ```

4. Restart Codex, then ask it to call `studio_auth_status` through
   `open-wilds-studio-local`. If the token expires, copy a fresh token and
   rerun the `codex mcp add` command.

Treat copied tokens like passwords. Do not commit them or paste them into
issues, logs, or public docs.

For general MCP clients:

```json
{
  "mcpServers": {
    "open-wilds-studio": {
      "command": "npx",
      "args": ["-y", "@open-wilds/studio-mcp"],
      "env": {
        "OPEN_WILDS_STUDIO_CONVEX_URL": "https://first-warthog-31.convex.cloud",
        "OPEN_WILDS_STUDIO_URL": "http://localhost:5173/studio"
      }
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
