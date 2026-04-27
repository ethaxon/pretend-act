import { describe, expect, it } from "vitest";

import { createCargoRegistryConfig } from "./index";

describe("cargo registry config", () => {
	it("creates cargo config and token env", () => {
		expect(
			createCargoRegistryConfig({
				name: "local-registry",
				indexUrl: "sparse+http://127.0.0.1:8080/index/",
				token: "secret",
			}),
		).toMatchObject({
			env: { CARGO_REGISTRIES_LOCAL_REGISTRY_TOKEN: "secret" },
		});
	});
});
