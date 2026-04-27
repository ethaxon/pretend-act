import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rm,
	symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PretendActError } from "./errors";
import {
	createWorkspaceFilter,
	type WorkspaceFilterOptions,
} from "./workspace-filter";

export type CopyWorkspaceOptions = {
	sourcePath: string;
	destinationPath: string;
	ignore?: string[];
	filter?: WorkspaceFilterOptions;
};

export async function createTempDirectory(
	prefix: string,
	parentPath = os.tmpdir(),
): Promise<string> {
	await mkdir(parentPath, { recursive: true });
	return mkdtemp(path.join(parentPath, prefix));
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
	const filter = await createWorkspaceFilter(options.sourcePath, {
		...options.filter,
		ignore: [...(options.filter?.ignore ?? []), ...(options.ignore ?? [])],
	});
	await copyPath(options.sourcePath, options.destinationPath, {
		rootPath: options.sourcePath,
		shouldCopy: filter.shouldCopy,
	});
}

async function copyPath(
	sourcePath: string,
	destinationPath: string,
	context: { rootPath: string; shouldCopy(relativePath: string): boolean },
): Promise<void> {
	const relativePath = path.relative(context.rootPath, sourcePath);
	if (!context.shouldCopy(relativePath)) {
		return;
	}

	const stat = await lstat(sourcePath);
	if (stat.isDirectory()) {
		await mkdir(destinationPath, { recursive: true });
		for (const entry of await readdir(sourcePath)) {
			await copyPath(
				path.join(sourcePath, entry),
				path.join(destinationPath, entry),
				context,
			);
		}
		return;
	}

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

async function ensureRealOrResolved(targetPath: string): Promise<string> {
	try {
		return await realpath(targetPath);
	} catch {
		return path.resolve(targetPath);
	}
}
