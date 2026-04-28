import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["examples", "**/*.spec.ts", "**/*.test.ts", "**/__tests__/**"],
		environment: "node",
	},
	resolve: {
		tsconfigPaths: true,
	},
});
