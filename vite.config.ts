import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    include: ["buffer", "@solana/web3.js"],
  },
});
