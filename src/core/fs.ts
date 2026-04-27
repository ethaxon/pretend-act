import nodeFs from "node:fs";
import {
	cp,
	glob,
	lstat,
	mkdir,
	mkdtemp,
	mkdtempDisposable,
	realpath,
	rm,
	symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";

import { PretendActError } from "./errors";
import {
	createWorkspaceExcludePatterns,
	isWorkspacePathExcluded,
	type WorkspaceFilterOptions,
	workspaceGlobPatterns,
} from "./workspace-filter";

export type CopyWorkspaceOptions = {
	sourcePath: string;
	destinationPath: string;
	workspacePath?: string;
	ignore?: string[];
	filter?: WorkspaceFilterOptions;
};

export type DisposableTempDirectory = Awaited<
	ReturnType<typeof mkdtempDisposable>
>;

export async function createTempDirectory(
	prefix: string,
	parentPath = os.tmpdir(),
): Promise<string> {
	await mkdir(parentPath, { recursive: true });
	return mkdtemp(path.join(parentPath, prefix));
}

export async function createDisposableTempDirectory(
	prefix: string,
	parentPath = os.tmpdir(),
): Promise<DisposableTempDirectory> {
	await mkdir(parentPath, { recursive: true });
	return mkdtempDisposable(path.join(parentPath, prefix));
}

export async function removePath(targetPath: string): Promise<void> {
	await rm(targetPath, { recursive: true, force: true });
}

export async function safeJoin(
	rootPath: string,
	...parts: string[]
): Promise<string> {
	const root = await ensureRealOrResolved(rootPath);
	const target = path.resolve(root, ...parts);
	const relativePath = path.relative(root, target);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		throw new PretendActError(`Path escapes root: ${target}`, {
			code: "PRETEND_ACT_PATH_ESCAPE",
		});
	}
	return target;
}

export async function copyWorkspace(
	options: CopyWorkspaceOptions,
): Promise<void> {
	if (options.filter?.useGitIgnore) {
		await copyGitTrackedWorkspace(options);
		return;
	}

	const excludePatterns = createWorkspaceExcludePatterns({
		...options.filter,
		ignore: [...(options.filter?.ignore ?? []), ...(options.ignore ?? [])],
	});
	await copyGlobWorkspace(
		options.sourcePath,
		options.destinationPath,
		excludePatterns,
	);
}

async function copyGitTrackedWorkspace(
	options: CopyWorkspaceOptions,
): Promise<void> {
	const workspacePath = path.resolve(
		options.workspacePath ?? options.sourcePath,
	);
	const sourcePath = path.resolve(options.sourcePath);
	const sourceRelativePath = path.relative(workspacePath, sourcePath);
	const sourcePrefix = sourceRelativePath
		? `${sourceRelativePath.split(path.sep).join("/")}/`
		: "";
	const excludePatterns = createWorkspaceExcludePatterns({
		...options.filter,
		ignore: [...(options.filter?.ignore ?? []), ...(options.ignore ?? [])],
	});
	const filePaths = await git.listFiles({
		dir: workspacePath,
		fs: nodeFs,
	});
	for (const filePath of filePaths) {
		if (sourcePrefix && !filePath.startsWith(sourcePrefix)) {
			continue;
		}
		const relativePath = sourcePrefix
			? filePath.slice(sourcePrefix.length)
			: filePath;
		if (
			!relativePath ||
			isWorkspacePathExcluded(relativePath, excludePatterns)
		) {
			continue;
		}
		try {
			await copyFilePath(
				path.join(workspacePath, filePath),
				path.join(options.destinationPath, relativePath),
			);
		} catch (error: unknown) {
			if (isNodeError(error) && error.code === "ENOENT") {
				continue;
			}
			throw error;
		}
	}
	await mkdir(options.destinationPath, { recursive: true });
}

async function copyGlobWorkspace(
	sourcePath: string,
	destinationPath: string,
	excludePatterns: readonly string[],
): Promise<void> {
	await mkdir(destinationPath, { recursive: true });
	for await (const relativePath of glob(workspaceGlobPatterns, {
		cwd: sourcePath,
		exclude: excludePatterns,
	})) {
		await copyPathEntry(
			path.join(sourcePath, relativePath),
			path.join(destinationPath, relativePath),
		);
	}
}

async function copyPathEntry(
	sourcePath: string,
	destinationPath: string,
): Promise<void> {
	const stat = await lstat(sourcePath);
	if (stat.isDirectory()) {
		await mkdir(destinationPath, { recursive: true });
		return;
	}
	await copyFilePath(sourcePath, destinationPath);
}

async function copyFilePath(
	sourcePath: string,
	destinationPath: string,
): Promise<void> {
	const stat = await lstat(sourcePath);
	if (stat.isSymbolicLink()) {
		const linkTarget = await realpath(sourcePath);
		await mkdir(path.dirname(destinationPath), { recursive: true });
		await symlink(linkTarget, destinationPath);
		return;
	}
	await mkdir(path.dirname(destinationPath), { recursive: true });
	await cp(sourcePath, destinationPath, {
		force: true,
		preserveTimestamps: true,
	});
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

async function ensureRealOrResolved(targetPath: string): Promise<string> {
	try {
		return await realpath(targetPath);
	} catch {
		return path.resolve(targetPath);
	}
}
