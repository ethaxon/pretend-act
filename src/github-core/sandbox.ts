import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ReflectiveInjector } from "injection-js";

import {
	copyWorkspace,
	createTempDirectory,
	type FileSystemBackend,
	PretendActError,
	removePath,
	spawnCommand,
	type WorkspaceFilterOptions,
} from "../core/index";
import {
	GithubActionsWorkspaceToken,
	GithubCheckoutBackendToken,
} from "./tokens";
import type {
	GithubActionsContainer,
	GithubActionsContainerOptions,
	GithubActionsWorkspace,
	GithubCheckoutBackend,
	GithubRepositoryOptions,
	GithubRepositorySandboxOptions,
	GithubRepositorySource,
	PretendInjectionToken,
} from "./types";

const missingProvider = Symbol("pretend-act missing provider");

export async function createGithubActionsContainer(
	options: GithubActionsContainerOptions,
): Promise<GithubActionsContainer> {
	const { repository } = options;
	const { sandbox, source } = repository;
	const repoName = repository.name;
	const owner = repository.owner ?? process.env.LOGNAME ?? "pretend-act";
	const rootPath =
		sandbox?.setupPath ??
		(await createTempDirectory("pretend-act-github-", sandbox?.tempRootPath));
	const repoPath = path.join(rootPath, repoName);
	await mkdir(rootPath, { recursive: true });
	const workspaceFilter = mergeWorkspaceFilter(source.workspaceFilter, {
		ignore: source.ignore,
	});
	let checkout: GithubCheckoutBackend | undefined;

	try {
		const files = source.files ?? [{ src: source.path, dest: "." }];
		for (const file of files) {
			await copyWorkspace({
				sourcePath: path.resolve(source.path, file.src),
				destinationPath: path.resolve(repoPath, file.dest ?? "."),
				workspacePath: path.resolve(source.path),
				filter: workspaceFilter,
			});
		}
		checkout =
			repository.checkout === false
				? undefined
				: await createGithubCheckoutBackend({
						checkout: repository.checkout ?? {},
						checkoutRootPath: path.join(rootPath, "checkout"),
						repository,
						repoName,
						source,
						workspaceFilter,
					});

		if (sandbox?.initializeGit ?? true) {
			await initializeGitRepo(repoPath, repository.defaultBranch ?? "main");
		}
	} catch (error) {
		await checkout?.stop();
		if (!sandbox?.keepOnFailure) {
			await removePath(rootPath);
		}
		throw error;
	}

	let cleaned = false;
	async function cleanup(cleanupOptions: { failed?: boolean } = {}) {
		if (cleaned) {
			return;
		}
		cleaned = true;
		await checkout?.stop();
		if (cleanupOptions.failed && sandbox?.keepOnFailure) {
			return;
		}
		await removePath(rootPath);
	}

	const workspace: GithubActionsWorkspace = {
		rootPath,
		repoPath,
		repoName,
		owner,
		keepOnFailure: sandbox?.keepOnFailure ?? false,
		materialized: true,
		backend: resolveFileSystemBackend(sandbox),
		getPath(repositoryName = repoName) {
			return repositoryName === repoName ? repoPath : undefined;
		},
		async materialize() {
			return repoPath;
		},
	};
	const injector = ReflectiveInjector.resolveAndCreate(
		[
			{ provide: GithubActionsWorkspaceToken, useValue: workspace },
			...(checkout
				? [{ provide: GithubCheckoutBackendToken, useValue: checkout }]
				: []),
			...(options.providers ?? []),
		],
		options.parentInjector,
	);

	return {
		workspace,
		checkout,
		injector,
		get(token) {
			const value = injector.get(token, missingProvider);
			return value === missingProvider ? undefined : value;
		},
		require(token) {
			const value = injector.get(token, missingProvider);
			if (value === missingProvider) {
				throw new PretendActError(
					`GitHub Actions provider '${providerName(token)}' is not available.`,
					{ code: "PRETEND_ACT_GITHUB_SERVICE_NOT_AVAILABLE" },
				);
			}
			return value;
		},
		cleanup,
		async [Symbol.asyncDispose]() {
			await cleanup();
		},
	};
}

function providerName<T>(token: PretendInjectionToken<T>): string {
	return "name" in token ? token.name : token.toString();
}

type CreateGithubCheckoutBackendOptions = {
	checkout: Exclude<GithubRepositoryOptions["checkout"], false | undefined>;
	checkoutRootPath: string;
	repository: GithubRepositoryOptions;
	repoName: string;
	source: GithubRepositorySource;
	workspaceFilter: WorkspaceFilterOptions;
};

async function createGithubCheckoutBackend(
	options: CreateGithubCheckoutBackendOptions,
): Promise<GithubCheckoutBackend> {
	const { createGitRegistry, GitRegistryTransport } = await import(
		"../git-registry/index"
	);
	return await createGitRegistry({
		workspacePath: options.source.path,
		rootPath: options.checkoutRootPath,
		repoName: options.repoName,
		defaultBranch: options.repository.defaultBranch,
		transport: options.checkout.transport ?? GitRegistryTransport.Http,
		http: options.checkout.http,
		remoteUrl: options.checkout.remoteUrl,
		sourceRef: options.checkout.sourceRef ?? options.repository.ref,
		sourceSha: options.checkout.sourceSha ?? options.repository.sha,
		snapshotBranch: options.checkout.snapshotBranch,
		snapshotMessage: options.checkout.snapshotMessage,
		workspaceFilter: mergeWorkspaceFilter(
			options.workspaceFilter,
			options.checkout.workspaceFilter,
		),
		forceSnapshot: options.checkout.forceSnapshot,
		keepOnStop: true,
	});
}

function resolveFileSystemBackend(
	sandbox: GithubRepositorySandboxOptions | undefined,
): FileSystemBackend | undefined {
	return typeof sandbox?.fsBackend === "object" ? sandbox.fsBackend : undefined;
}

function mergeWorkspaceFilter(
	base: WorkspaceFilterOptions | undefined,
	override: WorkspaceFilterOptions | undefined,
): WorkspaceFilterOptions {
	return {
		...base,
		...override,
		ignore: [...(base?.ignore ?? []), ...(override?.ignore ?? [])],
	};
}
async function initializeGitRepo(
	repoPath: string,
	defaultBranch: string,
): Promise<void> {
	await spawnCommand({
		command: "git",
		args: ["init", "-b", defaultBranch],
		cwd: repoPath,
	});
	await spawnCommand({
		command: "git",
		args: ["config", "user.email", "pretend-act@example.invalid"],
		cwd: repoPath,
	});
	await spawnCommand({
		command: "git",
		args: ["config", "user.name", "Pretend Act"],
		cwd: repoPath,
	});
	await spawnCommand({ command: "git", args: ["add", "."], cwd: repoPath });
	await spawnCommand({
		command: "git",
		args: ["commit", "--allow-empty", "-m", "Initial pretend-act sandbox"],
		cwd: repoPath,
	});
}
