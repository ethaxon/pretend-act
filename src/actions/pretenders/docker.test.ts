import { describe, expect, it } from "vitest";

import { compileActionPretendersToWorkflowOverlay } from "../compile";
import { createDockerPublishPretender } from "./docker";

describe("docker publish pretender", () => {
	it("does not match anything by default", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: { steps: [{ run: "docker push ghcr.io/acme/app:1" }] },
				},
			},
			actions: { docker: createDockerPublishPretender() },
		});

		expect(overlay).toEqual([]);
	});

	it("rewrites explicit opt-in docker push steps", async () => {
		const overlay = await compileActionPretendersToWorkflowOverlay({
			workflow: {
				jobs: {
					release: { steps: [{ run: "docker push ghcr.io/acme/app:1" }] },
				},
			},
			actions: {
				docker: createDockerPublishPretender({
					test: ({ step }) => step.run === "docker push ghcr.io/acme/app:1",
					registry: {
						registryUrl: "127.0.0.1:5000",
						imagePrefix: "127.0.0.1:5000",
					},
				}),
			},
		});

		expect(overlay).toEqual([
			{
				type: "replace-step",
				jobId: "release",
				selector: { index: 0 },
				step: {
					run: "docker tag ghcr.io/acme/app:1 127.0.0.1:5000/acme/app:1\ndocker push 127.0.0.1:5000/acme/app:1",
					env: { PRETEND_ACT_DOCKER_REGISTRY: "127.0.0.1:5000" },
				},
			},
		]);
	});
});
