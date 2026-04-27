import { ActRunner } from "./runner";
import { createGithubSandbox } from "./sandbox";
import type {
	ActRunnerOptions,
	GithubSandbox,
	GithubSandboxOptions,
} from "./types";

export class Act extends ActRunner {
	constructor(cwd?: string, workflowFile?: string, defaultImage?: string) {
		super({ cwd, workflowFile, defaultImage } satisfies ActRunnerOptions);
	}
}

export type MockGithubConfig = {
	repo?: Record<
		string,
		{
			owner?: string;
			files?: { src: string; dest?: string }[];
			defaultBranch?: string;
		}
	>;
};

export class MockGithubSandbox {
	private readonly config: MockGithubConfig;
	private readonly setupPath: string;
	private sandbox: GithubSandbox | undefined;

	constructor(config: MockGithubConfig, setupPath = process.cwd()) {
		this.config = config;
		this.setupPath = setupPath;
	}

	async setup(): Promise<void> {
		const [repoName, repoConfig] = Object.entries(
			this.config.repo ?? {},
		)[0] ?? ["repo", {}];
		const firstFile = repoConfig.files?.[0];
		const workspacePath = firstFile?.src ?? process.cwd();
		const options: GithubSandboxOptions = {
			workspacePath,
			setupPath: this.setupPath,
			repoName,
			owner: repoConfig.owner,
			defaultBranch: repoConfig.defaultBranch,
			files: repoConfig.files,
		};
		this.sandbox = await createGithubSandbox(options);
	}

	async teardown(): Promise<void> {
		await this.sandbox?.cleanup();
		this.sandbox = undefined;
	}

	get repo(): { getPath(repositoryName: string): string | undefined } {
		if (!this.sandbox) {
			throw new Error("Repositories have not been setup");
		}
		return {
			getPath: this.sandbox.getPath,
		};
	}
}
