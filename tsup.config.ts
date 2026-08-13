import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: {
    entry: { index: "src/index.ts" },
  },
});
