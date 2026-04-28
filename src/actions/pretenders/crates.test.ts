import { describe, expect, it } from "vitest";

import { compileActionPretendersToWorkflowOverlay } from "../compile";
import { createCargoPublishPretender } from "./crates";

describe("cargo publish pretender", () => {
	it("rewrites simple cargo publish steps to use the local registry", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: { steps: [{ name: "Publish", run: "cargo publish" }] },
				},
			},
			actions: {
				crates: createCargoPublishPretender({
					name: "local",
					indexUrl: "sparse+http://127.0.0.1:8080/index/",
					token: "token",
				}),
			},
		});

		expect(overlay).toEqual([
			{
				type: "replace-step",
				jobId: "release",
				selector: { index: 0 },
				step: {
					run: [
						"mkdir -p .cargo",
						"cat > .cargo/config.toml <<'PRETEND_ACT_CARGO_CONFIG'",
						'[registries.local]\nindex = "sparse+http://127.0.0.1:8080/index/"\n',
						"PRETEND_ACT_CARGO_CONFIG",
						"cargo publish --registry local",
					].join("\n"),
					env: { CARGO_REGISTRIES_LOCAL_TOKEN: "token" },
				},
			},
		]);
	});

	it("keeps publish steps with explicit registry overrides", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: { steps: [{ run: "cargo publish --registry crates-io" }] },
				},
			},
			actions: {
				crates: createCargoPublishPretender({
					indexUrl: "sparse+http://127.0.0.1:8080/index/",
				}),
			},
		});

		expect(overlay).toEqual([
			{
				type: "keep-step",
				jobId: "release",
				selector: { index: 0 },
			},
		]);
	});
});
