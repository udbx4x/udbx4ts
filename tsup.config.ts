import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "runtime-browser/index": "src/runtime-browser/index.ts",
    "runtime-electron/index": "src/runtime-electron/index.ts"
  },
  clean: true,
  dts: true,
  external: ["better-sqlite3"],
  format: ["esm", "cjs"],
  outDir: "dist",
  sourcemap: true,
  splitting: false,
  target: "es2020"
});

