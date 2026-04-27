import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
	copyWorkspace,
	createTempDirectory,
	removePath,
	spawnCommand,
} from "../core/index";
import type { GithubSandbox, GithubSandboxOptions } from "./types";

export async function createGithubSandbox(
	options: GithubSandboxOptions,
): Promise<GithubSandbox> {
	const repoName = options.repoName ?? "repo";
	const owner = options.owner ?? process.env.LOGNAME ?? "pretend-act";
	const rootPath =
		options.setupPath ??
		(await createTempDirectory("pretend-act-github-", options.tempRootPath));
	const repoPath = path.join(rootPath, repoName);
	await mkdir(rootPath, { recursive: true });

	const files = options.files ?? [{ src: options.workspacePath, dest: "." }];
	for (const file of files) {
		await copyWorkspace({
			sourcePath: path.resolve(options.workspacePath, file.src),
			destinationPath: path.resolve(repoPath, file.dest ?? "."),
			workspacePath: path.resolve(options.workspacePath),
			filter: {
				...options.workspaceFilter,
				ignore: [
					...(options.workspaceFilter?.ignore ?? []),
					...(options.ignore ?? []),
				],
			},
		});
	}

	if (options.initializeGit ?? true) {
		await initializeGitRepo(repoPath, options.defaultBranch ?? "main");
	}

	let cleaned = false;
	async function cleanup(cleanupOptions: { failed?: boolean } = {}) {
		if (cleaned) {
			return;
		}
		cleaned = true;
		if (cleanupOptions.failed && options.keepOnFailure) {
			return;
		}
		await removePath(rootPath);
	}

	return {
		rootPath,
		repoPath,
		repoName,
		owner,
		keepOnFailure: options.keepOnFailure ?? false,
		materialized: true,
		backend:
			typeof options.fsBackend === "object" ? options.fsBackend : undefined,
		getPath(repositoryName = repoName) {
			return repositoryName === repoName ? repoPath : undefined;
		},
		async materialize() {
			return repoPath;
		},
		cleanup,
		async dispose() {
			await cleanup();
		},
	};
}

export async function withMockGithub<T>(
	options: GithubSandboxOptions,
	callback: (sandbox: GithubSandbox) => Promise<T> | T,
): Promise<T> {
	const sandbox = await createGithubSandbox(options);
	let failed = false;
	try {
		return await callback(sandbox);
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		await sandbox.cleanup({ failed });
	}
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
