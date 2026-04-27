import { describe, expect, it } from "vitest";

import { buildActArgs, resolveActBinary } from "./runner";

describe("act runner args", () => {
	it("builds workflow dispatch args with inputs and container options", () => {
		expect(
			buildActArgs({
				event: "workflow_dispatch",
				workflowFile: ".github/workflows/release.yml",
				bind: true,
				inputs: { publish_npm: "false" },
				containerOptions: "--user 1000:1000",
			}),
		).toEqual([
			"workflow_dispatch",
			"-W",
			".github/workflows/release.yml",
			"--bind",
			"--container-options",
			"--user 1000:1000",
			"--input",
			"publish_npm=false",
		]);
	});

	it("prefers explicit act binary", () => {
		expect(resolveActBinary("/usr/bin/act")).toBe("/usr/bin/act");
	});

	it("builds validate args without an event", () => {
		expect(
			buildActArgs({
				validate: true,
				workflowFile: ".github/workflows/release.yml",
			}),
		).toEqual(["--validate", "-W", ".github/workflows/release.yml"]);
	});
});
