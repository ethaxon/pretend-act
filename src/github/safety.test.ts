import { describe, expect, it } from "vitest";

import { assertRemoteMockSafety } from "./safety";

describe("remote mock safety", () => {
	it("denies real publishing endpoints by default", () => {
		expect(() =>
			assertRemoteMockSafety({ npmRegistryUrl: "https://registry.npmjs.org" }),
		).toThrow("real service");
	});

	it("allows localhost endpoints", () => {
		expect(() =>
			assertRemoteMockSafety({
				npmRegistryUrl: "http://127.0.0.1:4873",
				dockerRegistryUrl: "127.0.0.1:5000",
			}),
		).not.toThrow();
	});
});
