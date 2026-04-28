import { describe, expect, it } from "vitest";

import { compileActionPretendersToWorkflowOverlay } from "../compile";
import { createNpmPublishPretender } from "./npm";

describe("npm publish pretender", () => {
	it("rewrites simple npm publish steps to use the local registry", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: {
						steps: [{ name: "Publish", run: "npm publish" }],
					},
				},
			},
			actions: {
				npm: createNpmPublishPretender({
					registryUrl: "http://127.0.0.1:4873/",
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
						"cat > .npmrc <<'PRETEND_ACT_NPMRC'",
						"registry=http://127.0.0.1:4873/\n//127.0.0.1:4873/:_authToken=token",
						"PRETEND_ACT_NPMRC",
						"npm publish",
					].join("\n"),
					env: { NPM_TOKEN: "token" },
				},
			},
		]);
	});

	it("keeps publish steps with explicit registry overrides", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: {
						steps: [
							{ run: "pnpm publish --registry https://registry.npmjs.org" },
						],
					},
				},
			},
			actions: {
				npm: createNpmPublishPretender({
					registryUrl: "http://127.0.0.1:4873/",
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
