import { describe, expect, it } from "vitest";

import { defineConfig, PretendEngineType } from "./index";

describe("config", () => {
	it("preserves typed config values", () => {
		const config = defineConfig({
			engine: {
				type: PretendEngineType.Act,
				options: {
					actBinary: "act",
				},
			},
			actions: {
				"actions/checkout": {
					test: /actions\/checkout@.*/i,
					pretender: () => ({
						operation: "replace",
						with: { run: "git fetch origin" },
					}),
				},
			},
			runner: {
				github: {
					repository: {
						name: "repo",
						source: {
							path: process.cwd(),
						},
					},
				},
			},
		});

		expect(config.engine?.type).toBe("act");
		expect(config.actions?.["actions/checkout"]?.test).toBeInstanceOf(RegExp);
	});
});
