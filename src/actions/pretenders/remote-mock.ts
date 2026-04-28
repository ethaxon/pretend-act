import type { Provider } from "injection-js";

import type { CratesRegistryService } from "../../crates-registry/index";
import type { DockerRegistryService } from "../../docker-registry/index";
import type { RemoteMockContainer } from "../../github/remote-mock";
import type { NpmRegistryService } from "../../npm-registry/index";
import type { ActionPretenderRegistry } from "../types";
import {
	type CargoPublishPretenderOptions,
	createCargoPublishPretender,
} from "./crates";
import {
	createDockerPublishPretender,
	type DockerPublishPretenderOptions,
} from "./docker";
import {
	createNpmPublishPretender,
	type NpmPublishPretenderOptions,
} from "./npm";
import {
	CratesRegistryServiceToken,
	DockerRegistryServiceToken,
	NpmRegistryServiceToken,
} from "./tokens";

export type RemoteMockPretenderBundle = {
	actions: ActionPretenderRegistry;
	env: Record<string, string>;
	secrets: Record<string, string>;
	providers: Provider[];
};

export type RemoteMockPretenderOptions = {
	npm?: boolean | Omit<NpmPublishPretenderOptions, "registry">;
	crates?: boolean | Omit<CargoPublishPretenderOptions, "registry">;
	docker?: false | DockerPublishPretenderOptions;
};

export function createRemoteMockPretenders(
	remoteMock: RemoteMockContainer,
	options: RemoteMockPretenderOptions = {},
): RemoteMockPretenderBundle {
	const actions: ActionPretenderRegistry = {};
	const providers = registryProviders(remoteMock);

	if (remoteMock.npm && options.npm !== false) {
		actions["remote-mock:npm-publish"] = createNpmPublishPretender({
			...(options.npm === true || options.npm === undefined ? {} : options.npm),
			registry: remoteMock.npm,
		});
	}
	if (remoteMock.crates && options.crates !== false) {
		actions["remote-mock:cargo-publish"] = createCargoPublishPretender({
			...(options.crates === true || options.crates === undefined
				? {}
				: options.crates),
			registry: remoteMock.crates,
		});
	}
	if (remoteMock.docker && options.docker) {
		actions["remote-mock:docker-publish"] = createDockerPublishPretender({
			...options.docker,
			registry: options.docker.registry ?? remoteMock.docker,
		});
	}

	return {
		actions,
		env: remoteMock.env,
		secrets: remoteMock.secrets,
		providers,
	};
}

function registryProviders(remoteMock: {
	npm?: NpmRegistryService;
	crates?: CratesRegistryService;
	docker?: DockerRegistryService;
}): Provider[] {
	return [
		...(remoteMock.npm
			? [{ provide: NpmRegistryServiceToken, useValue: remoteMock.npm }]
			: []),
		...(remoteMock.crates
			? [{ provide: CratesRegistryServiceToken, useValue: remoteMock.crates }]
			: []),
		...(remoteMock.docker
			? [{ provide: DockerRegistryServiceToken, useValue: remoteMock.docker }]
			: []),
	];
}
