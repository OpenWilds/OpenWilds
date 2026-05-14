<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Studio MCP

When working on Studio features, use the `studio-mcp` skill. Any new Studio
API, generation flow, world action, plant action, object action, asset library,
or workspace action must be exposed through `scripts/studio-mcp-server.mjs` in
the same change so LLM clients can operate the Studio surface.
