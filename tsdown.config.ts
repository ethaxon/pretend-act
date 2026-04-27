import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
        github: "./src/github/index.ts",
        npm: "./src/npm/index.ts",
        crates: './src/crates/index.ts',
	},
	format: "esm",
	dts: true,
	sourcemap: true,
	clean: true,
	outDir: "./dist",
});
