import { Buffer } from "buffer";

const browserGlobal = globalThis as {
  Buffer?: typeof Buffer;
  process?: {
    browser?: boolean;
    env: Record<string, string>;
  };
};

browserGlobal.Buffer ??= Buffer;
browserGlobal.process ??= {
  browser: true,
  env: { NODE_ENV: "development" },
};
