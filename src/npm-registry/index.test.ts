import { describe, expect, it } from "vitest";

import { createNpmRegistryConfig } from "./index";

describe("npm registry config", () => {
	it("creates npmrc and env", () => {
		expect(
			createNpmRegistryConfig({
				registryUrl: "https://registry.example.test/",
				token: "secret",
			}),
		).toMatchObject({
			env: { NPM_TOKEN: "secret" },
			npmrc:
				"registry=https://registry.example.test/\n//registry.example.test/:_authToken=secret",
		});
	});
});
