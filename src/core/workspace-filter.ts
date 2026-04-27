import nodeFs from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import git from "isomorphic-git";

export const defaultWorkspaceIgnore = [
	".git",
	"node_modules",
	"dist",
	"dist-tsc",
	"target",
	"temp/actions-cli",
];

export type WorkspaceFilterOptions = {
	ignore?: string[];
	useGitIgnore?: boolean | { filePath?: string };
	includeDefaultIgnore?: boolean;
};

export type WorkspaceFilter = {
	patterns: string[];
	excludePatterns: string[];
	shouldCopy(relativePath: string): boolean;
};

export const workspaceGlobPatterns = [
	"**/*",
	"**/.*",
	"**/.*/**",
	"**/.*/**/*",
];

export async function createWorkspaceFilter(
	workspacePath: string,
	options: WorkspaceFilterOptions = {},
): Promise<WorkspaceFilter> {
	const patterns = createWorkspaceIgnorePatterns(options);
	const excludePatterns = createWorkspaceExcludePatterns(options);
	const gitIgnoredPaths = options.useGitIgnore
		? await listGitIgnoredPaths(workspacePath, excludePatterns)
		: new Set<string>();

	if (patterns.length === 0 && gitIgnoredPaths.size === 0) {
		return {
			excludePatterns,
			patterns,
			shouldCopy: () => true,
		};
	}

	return {
		excludePatterns,
		patterns,
		shouldCopy(relativePath) {
			const normalizedPath = relativePath.split(path.sep).join("/");
			return (
				!normalizedPath ||
				(!isWorkspacePathExcluded(normalizedPath, excludePatterns) &&
					!isGitIgnoredPath(gitIgnoredPaths, normalizedPath))
			);
		},
	};
}

export function createWorkspaceIgnorePatterns(
	options: WorkspaceFilterOptions = {},
): string[] {
	return [
		...(options.includeDefaultIgnore === false ? [] : defaultWorkspaceIgnore),
		...(options.ignore ?? []),
	];
}

export function createWorkspaceExcludePatterns(
	options: WorkspaceFilterOptions = {},
): string[] {
	return createWorkspaceIgnorePatterns(options).flatMap((pattern) => {
		const normalizedPattern = normalizeWorkspacePattern(pattern);
		if (!normalizedPattern) {
			return [];
		}
		const patterns = [normalizedPattern];
		if (
			!normalizedPattern.startsWith("**/") &&
			!normalizedPattern.includes("/")
		) {
			patterns.push(`**/${normalizedPattern}`);
		}
		return patterns;
	});
}

export function isWorkspacePathExcluded(
	relativePath: string,
	excludePatterns: readonly string[],
): boolean {
	let normalizedPath = relativePath.split(path.sep).join("/");
	while (normalizedPath) {
		if (
			excludePatterns.some((pattern) =>
				path.matchesGlob(normalizedPath, pattern),
			)
		) {
			return true;
		}
		const parentPath = path.posix.dirname(normalizedPath);
		normalizedPath = parentPath === "." ? "" : parentPath;
	}
	return false;
}

async function listGitIgnoredPaths(
	workspacePath: string,
	excludePatterns: readonly string[],
): Promise<Set<string>> {
	const ignoredPaths = new Set<string>();
	await visitGitIgnoredPaths(
		workspacePath,
		workspacePath,
		excludePatterns,
		ignoredPaths,
	);
	return ignoredPaths;
}

async function visitGitIgnoredPaths(
	workspacePath: string,
	currentPath: string,
	excludePatterns: readonly string[],
	ignoredPaths: Set<string>,
): Promise<void> {
	const relativePath = path.relative(workspacePath, currentPath);
	const normalizedPath = relativePath.split(path.sep).join("/");
	if (normalizedPath === ".git" || normalizedPath.startsWith(".git/")) {
		ignoredPaths.add(normalizedPath);
		return;
	}
	if (
		normalizedPath &&
		isWorkspacePathExcluded(normalizedPath, excludePatterns)
	) {
		return;
	}
	const stat = await lstat(currentPath);
	if (normalizedPath) {
		const ignored = await git.isIgnored({
			dir: workspacePath,
			filepath: stat.isDirectory() ? `${normalizedPath}/` : normalizedPath,
			fs: nodeFs,
		});
		if (ignored) {
			ignoredPaths.add(normalizedPath);
			return;
		}
	}

	if (!stat.isDirectory()) {
		return;
	}
	for (const entry of await readdir(currentPath)) {
		await visitGitIgnoredPaths(
			workspacePath,
			path.join(currentPath, entry),
			excludePatterns,
			ignoredPaths,
		);
	}
}

function normalizeWorkspacePattern(pattern: string): string {
	return pattern
		.trim()
		.replaceAll("\\", "/")
		.replace(/^\.\//u, "")
		.replace(/^\/+|\/+$/gu, "");
}

function isGitIgnoredPath(
	ignoredPaths: Set<string>,
	normalizedPath: string,
): boolean {
	let currentPath = normalizedPath;
	while (currentPath) {
		if (ignoredPaths.has(currentPath)) {
			return true;
		}
		const parentPath = path.posix.dirname(currentPath);
		currentPath = parentPath === "." ? "" : parentPath;
	}
	return false;
}
