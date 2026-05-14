---
name: studio-mcp
description: Keep the Open Wilds Studio MCP server in sync with Studio features. Use when adding or changing Studio views, Studio Convex functions, generation flows, asset libraries, world/map actions, workspace actions, or browser-only Studio helpers that an LLM should be able to operate.
---

# Studio MCP

Use this skill whenever a change touches Studio functionality.

## Required Context

- If the change touches Convex code, read `convex/_generated/ai/guidelines.md`
  before editing.
- Treat `convex/studio.ts` and `convex/workspaces.ts` as the authoritative
  Studio backend surface.
- Treat `scripts/studio-mcp-server.mjs` as the LLM-facing mirror of that
  surface.

## MCP Coverage Rule

When you add, rename, or change a Studio feature, update the MCP server in the
same change.

For each new Studio capability, add or update:

- The allowlisted Convex function in `convexApiSurface` when the feature is
  backed by Convex.
- A typed MCP tool with a clear `inputSchema` and handler.
- Upload helpers or local processing helpers when the browser feature depends
  on local files, generated media, or browser-only transforms.
- Any auth requirements, preserving Convex workspace role checks instead of
  bypassing them.

Prefer typed tools over only relying on `studio_call_api`. The raw allowlisted
caller is a fallback, not the primary user experience.

## Auth Expectations

- Studio MCP tools must use Convex Auth through `studio_sign_in` or
  `OPEN_WILDS_STUDIO_AUTH_TOKEN`.
- Do not add MCP-only admin bypasses for workspace data.
- Do not accept user ids for authorization; let Convex derive identity and
  enforce workspace roles.

## Verification

Run at least:

```bash
node --check scripts/studio-mcp-server.mjs
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node scripts/studio-mcp-server.mjs
```

For generation or upload changes, also smoke-test the relevant MCP tool with a
non-production workspace when credentials are available.
