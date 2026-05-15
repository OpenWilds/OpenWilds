# Open Wilds Studio MCP Server

MCP server for Open Wilds Studio workspaces, asset generation, terrain assets,
plant and object sprites, and saved maps.

<!-- mcp-name: io.github.openwilds/studio-mcp -->

## Use With An MCP Client

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

Authentication uses Convex Auth:

- For local Codex development, copy a short-lived token env line from Studio's
  workspace panel, then pass it as `OPEN_WILDS_STUDIO_AUTH_TOKEN`.
- `studio_sign_in` remains available for local email/password auth.
- `studio_login_browser` can open Studio and capture a browser session through a
  localhost callback, but that flow is experimental for local stdio clients.

The server never bypasses Studio workspace permissions. Convex still enforces
viewer, editor, admin, and owner role checks.

## Local Development

```sh
npm install
npm run verify
```

The server reads `.env.local` from the current working directory, or use
`OPEN_WILDS_STUDIO_CONVEX_URL` directly.

For local Codex testing without publishing a package, run Studio first:

```sh
cd /Users/ajand/Projects/solana/open-wilds
npm run studio
```

Open `http://localhost:5173/studio`, sign in, open the workspace panel, and use
`MCP Access` to copy the `OPEN_WILDS_STUDIO_AUTH_TOKEN=...` env line. Register
the local server with Codex:

```sh
codex mcp remove open-wilds-studio-local

codex mcp add open-wilds-studio-local \
  --env OPEN_WILDS_STUDIO_CONVEX_URL=https://first-warthog-31.convex.cloud \
  --env OPEN_WILDS_STUDIO_URL=http://localhost:5173/studio \
  --env OPEN_WILDS_STUDIO_MCP_ROOT=/Users/ajand/Projects/solana/open-wilds \
  --env OPEN_WILDS_STUDIO_AUTH_TOKEN='<paste-token-here>' \
  -- node /Users/ajand/Projects/solana/open-wilds/packages/open-wilds-studio-mcp/bin/open-wilds-studio-mcp.mjs
```

Restart Codex, then ask it to call `studio_auth_status` through
`open-wilds-studio-local`. If the token expires, copy a fresh token and rerun
the `codex mcp add` command. Treat copied tokens like passwords.

Relative file paths passed to upload/register tools resolve from the client's
current working directory. Set `OPEN_WILDS_STUDIO_MCP_ROOT` to choose a
different root. Absolute paths are rejected unless
`OPEN_WILDS_STUDIO_MCP_ALLOW_ABSOLUTE_PATHS=1` is set.

## Tool Surface

- Auth tools: status, sign in, sign out.
- Workspace tools: create/list/get, roles, members, invites.
- Texture tools: generate/list/register source textures.
- Terrain tools: build/register/list terrain assets and end-to-end
  texture-to-terrain generation.
- Plant tools: generate/register/list plant and tree sprites.
- Object tools: generate/register/list object and building sprites.
- World tools: save and list Studio maps.
