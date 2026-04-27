import { importOptionalPeer } from "../core/index";

export * from "../git-registry/index";

export type WorkflowDispatchEventOptions = {
	owner: string;
	repo: string;
	ref: string;
	sha?: string;
	inputs?: Record<string, string>;
};

export type GithubApiClientOptions = {
	baseUrl?: string;
	token?: string;
};

type OctokitModule = {
	Octokit: new (options?: { baseUrl?: string; auth?: string }) => unknown;
};

export async function createGithubApiClient(
	options: GithubApiClientOptions = {},
): Promise<unknown> {
	const { Octokit } = await importOptionalPeer<OctokitModule>(
		"@octokit/core",
		"github registry API client",
	);
	return new Octokit({
		baseUrl: options.baseUrl,
		auth: options.token,
	});
}

export function createWorkflowDispatchEvent(
	options: WorkflowDispatchEventOptions,
) {
	return {
		inputs: options.inputs ?? {},
		ref: options.ref,
		repository: {
			full_name: `${options.owner}/${options.repo}`,
			name: options.repo,
			owner: {
				login: options.owner,
			},
		},
		after: options.sha,
	};
}

export function createPushEvent(options: WorkflowDispatchEventOptions) {
	return {
		ref: options.ref,
		after: options.sha,
		repository: {
			full_name: `${options.owner}/${options.repo}`,
			name: options.repo,
			owner: {
				login: options.owner,
			},
		},
	};
}
