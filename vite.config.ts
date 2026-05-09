import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    envDir: process.cwd(),
    define: {
      __OPEN_WILDS_CONVEX_URL__: JSON.stringify(env.VITE_CONVEX_URL ?? ""),
    },
    resolve: {
      alias: {
        buffer: "buffer/",
      },
    },
    optimizeDeps: {
      include: [
        "buffer",
        "@solana/web3.js",
        "@coral-xyz/anchor",
        "@magicblock-labs/bolt-sdk",
      ],
    },
  };
});
