import { InjectionToken } from "injection-js";

import type { CratesRegistryService } from "../../crates-registry/index";
import type { DockerRegistryService } from "../../docker-registry/index";
import type { NpmRegistryService } from "../../npm-registry/index";

export const NpmRegistryServiceToken = new InjectionToken<NpmRegistryService>(
	"pretend-act.remote-mock.npm",
);

export const CratesRegistryServiceToken =
	new InjectionToken<CratesRegistryService>("pretend-act.remote-mock.crates");

export const DockerRegistryServiceToken =
	new InjectionToken<DockerRegistryService>("pretend-act.remote-mock.docker");
