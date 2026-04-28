import type { CratesRegistryService } from "../crates-registry/index";
import { startCratesRegistry } from "../crates-registry/index";
import type { DockerRegistryService } from "../docker-registry/index";
import { startDockerRegistry } from "../docker-registry/index";
import type { NpmRegistryService } from "../npm-registry/index";
import { startNpmRegistry } from "../npm-registry/index";
import { assertRemoteMockSafety, type RemoteMockSafetyOptions } from "./safety";

export type RemoteMockContainer = AsyncDisposable & {
	mode: "remote-mock";
	npm?: NpmRegistryService;
	crates?: CratesRegistryService;
	docker?: DockerRegistryService;
	env: Record<string, string>;
	secrets: Record<string, string>;
	stop(): Promise<void>;
};

export type RemoteMockContainerOptions = {
	npm?: boolean | Parameters<typeof startNpmRegistry>[0];
	crates?: boolean | Parameters<typeof startCratesRegistry>[0];
	docker?: boolean | Parameters<typeof startDockerRegistry>[0];
	safety?: RemoteMockSafetyOptions;
};

export async function createRemoteMockContainer(
	options: RemoteMockContainerOptions = {},
): Promise<RemoteMockContainer> {
	let npm: NpmRegistryService | undefined;
	let crates: CratesRegistryService | undefined;
	let docker: DockerRegistryService | undefined;
	try {
		npm = options.npm
			? await startNpmRegistry(options.npm === true ? {} : options.npm)
			: undefined;
		crates = options.crates
			? await startCratesRegistry(options.crates === true ? {} : options.crates)
			: undefined;
		docker = options.docker
			? await startDockerRegistry(options.docker === true ? {} : options.docker)
			: undefined;
	} catch (error) {
		await stopRemoteMockServices(npm, crates, docker);
		throw error;
	}
	assertRemoteMockSafety({
		...options.safety,
		npmRegistryUrl: npm?.registryUrl ?? options.safety?.npmRegistryUrl,
		cratesRegistryUrl: crates?.registryUrl ?? options.safety?.cratesRegistryUrl,
		dockerRegistryUrl: docker?.registryUrl ?? options.safety?.dockerRegistryUrl,
	});

	async function stop() {
		await stopRemoteMockServices(npm, crates, docker);
	}

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
		stop,
		async [Symbol.asyncDispose]() {
			await stop();
		},
	};
}

async function stopRemoteMockServices(
	npm?: NpmRegistryService,
	crates?: CratesRegistryService,
	docker?: DockerRegistryService,
): Promise<void> {
	await Promise.all([npm?.stop(), crates?.stop(), docker?.stop()]);
}

export type { RemoteMockSafetyOptions } from "./safety";
export { assertRemoteMockSafety } from "./safety";
