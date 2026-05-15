#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "list";
const serverPath = fileURLToPath(
  new URL("../bin/open-wilds-studio-mcp.mjs", import.meta.url)
);

const env = { ...process.env };
env.OPEN_WILDS_STUDIO_AUTH_TOKEN = "";
env.CONVEX_AUTH_TOKEN = "";

const child = spawn(process.execPath, [serverPath], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

const messages = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    },
  },
  mode === "auth"
    ? {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "studio_auth_status", arguments: {} },
      }
    : {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
];

for (const message of messages) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}
child.stdin.end();

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (exitCode !== 0) {
  throw new Error(`MCP server exited with code ${exitCode}.`);
}

const responses = stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const initialize = responses.find((response) => response.id === 1);
if (!initialize?.result?.serverInfo?.name) {
  throw new Error("MCP initialize smoke test failed.");
}

const result = responses.find((response) => response.id === 2)?.result;
if (mode === "auth") {
  const text = result?.content?.[0]?.text;
  const status = text ? JSON.parse(text) : null;
  if (!status || typeof status.convexUrlConfigured !== "boolean") {
    throw new Error("studio_auth_status smoke test failed.");
  }
} else if (
  !Array.isArray(result?.tools) ||
  !result.tools.some((tool) => tool.name === "studio_auth_status")
) {
  throw new Error("tools/list smoke test failed.");
}

console.log(`ok: ${mode}`);
