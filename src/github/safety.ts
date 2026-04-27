import { PretendActError } from "../core/index";

export type RemoteMockSafetyOptions = {
	npmRegistryUrl?: string;
	cratesRegistryUrl?: string;
	dockerRegistryUrl?: string;
	githubApiUrl?: string;
	allowRealEndpoints?: boolean;
};

const realEndpointHosts = new Set([
	"registry.npmjs.org",
	"crates.io",
	"index.crates.io",
	"ghcr.io",
	"api.github.com",
]);

export function assertRemoteMockSafety(options: RemoteMockSafetyOptions): void {
	if (options.allowRealEndpoints) {
		return;
	}

	for (const [label, value] of Object.entries(options)) {
		if (!value || typeof value !== "string" || label === "allowRealEndpoints") {
			continue;
		}
		const host = parseEndpointHost(value);
		if (host && realEndpointHosts.has(host)) {
			throw new PretendActError(
				`Remote mock endpoint '${label}' points to real service '${host}'.`,
				{ code: "PRETEND_ACT_REAL_ENDPOINT_DENIED" },
			);
		}
	}
}

function parseEndpointHost(value: string): string | undefined {
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).host;
	} catch {
		return undefined;
	}
}
