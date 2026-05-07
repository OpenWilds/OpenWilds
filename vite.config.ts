import { defineConfig } from "vite";

export default defineConfig({
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
});
