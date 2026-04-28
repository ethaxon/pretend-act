import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		"github/index": "./src/github/index.ts",
		"github-core/index": "./src/github-core/index.ts",
		"github-artifacts/index": "./src/github-artifacts/index.ts",
		"config/index": "./src/config/index.ts",
		"workflows/index": "./src/workflows/index.ts",
		"actions/index": "./src/actions/index.ts",
		"engine/index": "./src/engine/index.ts",
		"runner/index": "./src/runner/index.ts",
		"github-registry/index": "./src/github-registry/index.ts",
		"git-registry/index": "./src/git-registry/index.ts",
		"npm-registry/index": "./src/npm-registry/index.ts",
		"crates-registry/index": "./src/crates-registry/index.ts",
		"docker-registry/index": "./src/docker-registry/index.ts",
		"npm/index": "./src/npm/index.ts",
		"crates/index": "./src/crates/index.ts",
	},
	format: "esm",
	dts: true,
	sourcemap: true,
	clean: true,
	outDir: "./dist",
});
