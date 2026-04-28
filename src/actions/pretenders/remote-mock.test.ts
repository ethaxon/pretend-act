import { describe, expect, it } from "vitest";

import type { CratesRegistryService } from "../../crates-registry/index";
import type { DockerRegistryService } from "../../docker-registry/index";
import type { RemoteMockContainer } from "../../github/remote-mock";
import type { NpmRegistryService } from "../../npm-registry/index";
import { createRemoteMockPretenders } from "./remote-mock";

describe("remote mock pretender bundle", () => {
	it("registers pretenders and providers for available services", () => {
		const remoteMock = {
			mode: "remote-mock",
			npm: {
				registryUrl: "http://127.0.0.1:4873/",
				npmrc: "registry=http://127.0.0.1:4873/",
				env: {},
			} as NpmRegistryService,
			crates: {
				name: "local",
				registryUrl: "http://127.0.0.1:8080",
				indexUrl: "sparse+http://127.0.0.1:8080/index/",
				configToml: "",
				env: {},
			} as CratesRegistryService,
			docker: {
				registryUrl: "127.0.0.1:5000",
				imagePrefix: "127.0.0.1:5000",
			} as DockerRegistryService,
			env: { NPM_TOKEN: "token" },
			secrets: { GITHUB_TOKEN: "fake" },
			async stop() {},
			async [Symbol.asyncDispose]() {},
		} as RemoteMockContainer;

		const bundle = createRemoteMockPretenders(remoteMock, {
			docker: {
				test: ({ step }) => step.run === "docker push app:1",
			},
		});

		expect(Object.keys(bundle.actions)).toEqual([
			"remote-mock:npm-publish",
			"remote-mock:cargo-publish",
			"remote-mock:docker-publish",
		]);
		expect(bundle.env).toEqual({ NPM_TOKEN: "token" });
		expect(bundle.secrets).toEqual({ GITHUB_TOKEN: "fake" });
		expect(bundle.providers).toHaveLength(3);
	});

	it("does not register docker pretender unless it is explicitly enabled", () => {
		const remoteMock = {
			mode: "remote-mock",
			docker: {
				registryUrl: "127.0.0.1:5000",
				imagePrefix: "127.0.0.1:5000",
			} as DockerRegistryService,
			env: {},
			secrets: {},
			async stop() {},
			async [Symbol.asyncDispose]() {},
		} as RemoteMockContainer;

		expect(createRemoteMockPretenders(remoteMock).actions).toEqual({});
	});
});
