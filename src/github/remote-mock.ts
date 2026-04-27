import type { CratesRegistryService } from "../crates-registry/index";
import { startCratesRegistry } from "../crates-registry/index";
import type { DockerRegistryService } from "../docker-registry/index";
import { startDockerRegistry } from "../docker-registry/index";
import type { NpmRegistryService } from "../npm-registry/index";
import { startNpmRegistry } from "../npm-registry/index";
import { assertRemoteMockSafety, type RemoteMockSafetyOptions } from "./safety";

export type RemoteMockEnvironment = {
	mode: "remote-mock";
	npm?: NpmRegistryService;
	crates?: CratesRegistryService;
	docker?: DockerRegistryService;
	env: Record<string, string>;
	secrets: Record<string, string>;
	stop(): Promise<void>;
};

export type RemoteMockEnvironmentOptions = {
	npm?: boolean | Parameters<typeof startNpmRegistry>[0];
	crates?: boolean | Parameters<typeof startCratesRegistry>[0];
	docker?: boolean | Parameters<typeof startDockerRegistry>[0];
	safety?: RemoteMockSafetyOptions;
};

export async function createRemoteMockEnvironment(
	options: RemoteMockEnvironmentOptions = {},
): Promise<RemoteMockEnvironment> {
	const npm = options.npm
		? await startNpmRegistry(options.npm === true ? {} : options.npm)
		: undefined;
	const crates = options.crates
		? await startCratesRegistry(options.crates === true ? {} : options.crates)
		: undefined;
	const docker = options.docker
		? await startDockerRegistry(options.docker === true ? {} : options.docker)
		: undefined;
	assertRemoteMockSafety({
		...options.safety,
		npmRegistryUrl: npm?.registryUrl ?? options.safety?.npmRegistryUrl,
		cratesRegistryUrl: crates?.registryUrl ?? options.safety?.cratesRegistryUrl,
		dockerRegistryUrl: docker?.registryUrl ?? options.safety?.dockerRegistryUrl,
	});

	return {
		mode: "remote-mock",
		npm,
		crates,
		docker,
		env: {
			...(npm?.env ?? {}),
			...(crates?.env ?? {}),
			...(docker ? { PRETEND_ACT_DOCKER_REGISTRY: docker.registryUrl } : {}),
		},
		secrets: {
			GITHUB_TOKEN: "pretend-act-github-token",
		},
		async stop() {
			await Promise.all([npm?.stop(), crates?.stop(), docker?.stop()]);
		},
	};
}

export async function withRemoteMockEnvironment<T>(
	options: RemoteMockEnvironmentOptions,
	callback: (environment: RemoteMockEnvironment) => Promise<T> | T,
): Promise<T> {
	const environment = await createRemoteMockEnvironment(options);
	try {
		return await callback(environment);
	} finally {
		await environment.stop();
	}
}

export type { RemoteMockSafetyOptions } from "./safety";
export { assertRemoteMockSafety } from "./safety";
