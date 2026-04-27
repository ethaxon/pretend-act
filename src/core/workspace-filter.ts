import { readFile } from "node:fs/promises";
import path from "node:path";

import { PretendActError } from "./errors";
import { importOptionalPeer } from "./optional-peer";

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
	shouldCopy(relativePath: string): boolean;
};

type IgnoreModule = {
	default?: () => IgnoreMatcher;
};

type IgnoreMatcher = {
	add(patterns: string[]): IgnoreMatcher;
	ignores(path: string): boolean;
};

export async function createWorkspaceFilter(
	workspacePath: string,
	options: WorkspaceFilterOptions = {},
): Promise<WorkspaceFilter> {
	const patterns = [
		...(options.includeDefaultIgnore === false ? [] : defaultWorkspaceIgnore),
		...(await readGitIgnorePatterns(workspacePath, options.useGitIgnore)),
		...(options.ignore ?? []),
	];

	if (patterns.length === 0) {
		return {
			patterns,
			shouldCopy: () => true,
		};
	}

	const ignoreModule = await importOptionalPeer<IgnoreModule>(
		"ignore",
		"workspace filter",
	);
	const createIgnore = ignoreModule.default;
	if (!createIgnore) {
		throw new PretendActError(
			"Optional peer 'ignore' did not expose a default export.",
			{ code: "PRETEND_ACT_INVALID_OPTIONAL_PEER" },
		);
	}

	const matcher = createIgnore().add(patterns);
	return {
		patterns,
		shouldCopy(relativePath) {
			const normalizedPath = relativePath.split(path.sep).join("/");
			return !normalizedPath || !matcher.ignores(normalizedPath);
		},
	};
}

async function readGitIgnorePatterns(
	workspacePath: string,
	useGitIgnore: WorkspaceFilterOptions["useGitIgnore"],
): Promise<string[]> {
	if (!useGitIgnore) {
		return [];
	}

	const gitIgnorePath =
		typeof useGitIgnore === "object" && useGitIgnore.filePath
			? useGitIgnore.filePath
			: path.join(workspacePath, ".gitignore");

	try {
		return (await readFile(gitIgnorePath, "utf8"))
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}
