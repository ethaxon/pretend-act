import nodeFs, { type Dirent, type Stats } from "node:fs";
import {
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import git from "isomorphic-git";

import {
	createTempDirectory,
	createWorkspaceFilter,
	removePath,
	type WorkspaceFilterOptions,
} from "../core/index";

export type GitRegistryOptions = {
	workspacePath: string;
	rootPath?: string;
	repoName?: string;
	defaultBranch?: string;
	transport?: GitRegistryTransport;
	http?: GitHttpTransportCreateOptions;
	remoteUrl?: string;
	sourceRef?: string;
	sourceSha?: string;
	snapshotBranch?: string;
	snapshotMessage?: string;
	workspaceFilter?: WorkspaceFilterOptions;
	forceSnapshot?: boolean;
	keepOnStop?: boolean;
};

export const GitRegistryTransport = {
	File: "file",
	Http: "http",
} as const;

export type GitRegistryTransport =
	(typeof GitRegistryTransport)[keyof typeof GitRegistryTransport];

export type GitHttpTransportCreateOptions = {
	hostname?: string;
	port?: number;
	pathPrefix?: string;
	publicUrl?: string;
};

export type GitHttpTransportOptions = GitHttpTransportCreateOptions & {
	repositoryPath: string;
	repoName?: string;
};

export type GitHttpTransport = AsyncDisposable & {
	repositoryPath: string;
	remoteUrl: string;
	hostname: string;
	port: number;
	pathPrefix: string;
	stop(): Promise<void>;
};

export type GitRegistry = AsyncDisposable & {
	rootPath: string;
	gitdir: string;
	repositoryPath: string;
	remoteUrl: string;
	transport: GitRegistryTransport;
	http?: GitHttpTransport;
	fetchRef: string;
	checkoutSha: string;
	mode: "direct" | "snapshot";
	snapshotBranch?: string;
	snapshotWorktreePath?: string;
	stop(): Promise<void>;
};

export type CheckoutGitServerOptions = GitRegistryOptions;
export type CheckoutGitServer = GitRegistry & {
	bareRepoPath: string;
};

export type CheckoutReplacementStepOptions = {
	path?: string;
	clean?: boolean;
};

export type CheckoutReplacementStep = {
	name: string;
	shell: "bash";
	run: string;
};

const gitAuthor = {
	name: "Pretend Act",
	email: "pretend-act@example.invalid",
};

export async function createGitRegistry(
	options: GitRegistryOptions,
): Promise<GitRegistry> {
	const workspacePath = path.resolve(options.workspacePath);
	const sourceGitdir = await resolveGitDir(workspacePath);
	const rootPath =
		options.rootPath ?? (await createTempDirectory("pretend-act-git-"));
	const repoName = options.repoName ?? "repo";
	const repositoryPath = path.join(rootPath, "repositories", `${repoName}.git`);
	await mkdir(repositoryPath, { recursive: true });
	await git.init({
		bare: true,
		defaultBranch: options.defaultBranch ?? "main",
		dir: repositoryPath,
		fs: nodeFs,
	});
	await copyObjectDatabase(sourceGitdir, repositoryPath);

	const directSource = await resolveDirectSource({
		...options,
		workspacePath,
		sourceGitdir,
	});
	const result = directSource
		? await pushDirectSource(repositoryPath, directSource)
		: await pushSnapshotSource(rootPath, repositoryPath, {
				...options,
				workspacePath,
				sourceGitdir,
			});
	const transport = options.transport ?? GitRegistryTransport.File;
	const httpTransport =
		transport === GitRegistryTransport.Http
			? await startGitHttpTransport({
					...options.http,
					repositoryPath,
					repoName,
				})
			: undefined;

	let stopped = false;
	async function stop(): Promise<void> {
		if (stopped) {
			return;
		}
		stopped = true;
		await httpTransport?.stop();
		if (!options.keepOnStop) {
			await removePath(rootPath);
		}
	}

	return {
		rootPath,
		gitdir: repositoryPath,
		repositoryPath,
		remoteUrl:
			options.remoteUrl ??
			httpTransport?.remoteUrl ??
			pathToFileURL(repositoryPath).href,
		transport,
		http: httpTransport,
		fetchRef: result.fetchRef,
		checkoutSha: result.checkoutSha,
		mode: result.mode,
		snapshotBranch: result.snapshotBranch,
		snapshotWorktreePath: result.snapshotWorktreePath,
		stop,
		[Symbol.asyncDispose]: stop,
	};
}

export async function startGitHttpTransport(
	options: GitHttpTransportOptions,
): Promise<GitHttpTransport> {
	const repositoryPath = path.resolve(options.repositoryPath);
	const pathPrefix = normalizeHttpPathPrefix(
		options.pathPrefix ?? defaultGitHttpPathPrefix(options.repoName ?? "repo"),
	);
	await prepareGitHttpRepository(repositoryPath);
	const server = createServer((request, response) => {
		void serveGitHttpRepository({
			pathPrefix,
			repositoryPath,
			request,
			response,
		}).catch((error: unknown) => {
			if (!response.headersSent) {
				response.writeHead(500, {
					"content-type": "text/plain; charset=utf-8",
				});
			}
			response.end(error instanceof Error ? error.message : "Git HTTP error");
		});
	});
	const hostname = options.hostname ?? "127.0.0.1";
	const port = options.port ?? 0;
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error): void => {
			server.off("listening", onListening);
			reject(error);
		};
		const onListening = (): void => {
			server.off("error", onError);
			resolve();
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(port, hostname);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Git HTTP transport did not bind to a TCP address");
	}
	let stopped = false;
	async function stop(): Promise<void> {
		if (stopped) {
			return;
		}
		stopped = true;
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}
	return {
		repositoryPath,
		remoteUrl:
			options.publicUrl ?? buildGitHttpUrl(hostname, address, pathPrefix),
		hostname,
		port: address.port,
		pathPrefix,
		stop,
		[Symbol.asyncDispose]: stop,
	};
}

export async function createCheckoutGitServer(
	options: CheckoutGitServerOptions,
): Promise<CheckoutGitServer> {
	const registry = await createGitRegistry(options);
	return { ...registry, bareRepoPath: registry.repositoryPath };
}

export function createCheckoutReplacementStep(
	server: Pick<GitRegistry, "checkoutSha" | "fetchRef" | "remoteUrl">,
	options: CheckoutReplacementStepOptions = {},
): CheckoutReplacementStep {
	const githubWorkspaceParameter = "{GITHUB_WORKSPACE:-$PWD}";
	const pathCommand = options.path
		? `workspace="$workspace"/${shellQuote(options.path)}`
		: "";
	const cleanCommand = options.clean === false ? "" : "git clean -ffdx";
	return {
		name: "Checkout source from pretend-act git registry",
		shell: "bash",
		run: [
			"set -euo pipefail",
			`workspace="$${githubWorkspaceParameter}"`,
			pathCommand,
			'mkdir -p "$workspace"',
			'cd "$workspace"',
			'git config --global --add safe.directory "$workspace" >/dev/null 2>&1 || true',
			"git init .",
			"git remote remove origin >/dev/null 2>&1 || true",
			`git remote add origin ${shellQuote(server.remoteUrl)}`,
			`git fetch --no-tags --prune origin ${shellQuote(server.fetchRef)}`,
			`git checkout --force ${shellQuote(server.checkoutSha)}`,
			cleanCommand,
		]
			.filter(Boolean)
			.join("\n"),
	};
}

type DirectSource = {
	commitOid: string;
	targetRef: string;
};

type PushResult = {
	fetchRef: string;
	checkoutSha: string;
	mode: "direct" | "snapshot";
	snapshotBranch?: string;
	snapshotWorktreePath?: string;
};

type ResolvedOptions = GitRegistryOptions & {
	workspacePath: string;
	sourceGitdir: string;
};

async function resolveDirectSource(
	options: ResolvedOptions,
): Promise<DirectSource | undefined> {
	if (options.forceSnapshot) {
		return undefined;
	}
	const defaultBranch = options.defaultBranch ?? "main";
	if (options.sourceSha) {
		return {
			commitOid: await resolveCommit(options, options.sourceSha),
			targetRef: `refs/heads/${defaultBranch}`,
		};
	}
	if (!options.sourceRef) {
		return undefined;
	}
	const sourceRef = options.sourceRef;
	if (sourceRef.startsWith("refs/tags/")) {
		return {
			commitOid: await resolveCommit(options, sourceRef),
			targetRef: sourceRef,
		};
	}
	const tagRef = sourceRef.includes("/") ? undefined : `refs/tags/${sourceRef}`;
	if (tagRef && (await refExists(options.sourceGitdir, tagRef))) {
		return {
			commitOid: await resolveCommit(options, tagRef),
			targetRef: tagRef,
		};
	}
	const branchName = sourceRef.startsWith("refs/heads/")
		? sourceRef.slice("refs/heads/".length)
		: sourceRef;
	const branchRef = `refs/heads/${branchName}`;
	if (
		(await refExists(options.sourceGitdir, branchRef)) &&
		(await isCleanWorktree(options))
	) {
		return {
			commitOid: await resolveCommit(options, branchRef),
			targetRef: branchRef,
		};
	}
	return undefined;
}

async function pushDirectSource(
	remoteGitdir: string,
	source: DirectSource,
): Promise<PushResult> {
	await git.writeRef({
		fs: nodeFs,
		gitdir: remoteGitdir,
		force: true,
		ref: source.targetRef,
		value: source.commitOid,
	});
	return {
		fetchRef: source.targetRef,
		checkoutSha: source.commitOid,
		mode: "direct",
	};
}

async function prepareGitHttpRepository(gitdir: string): Promise<void> {
	await mkdir(path.join(gitdir, "info"), { recursive: true });
	await mkdir(path.join(gitdir, "objects", "info"), { recursive: true });
	await writeFile(
		path.join(gitdir, "info", "refs"),
		await formatInfoRefs(gitdir),
	);
	await writeFile(
		path.join(gitdir, "objects", "info", "packs"),
		await formatPacks(gitdir),
	);
}

async function formatInfoRefs(gitdir: string): Promise<string> {
	const refs = await listLooseRefs(gitdir, "refs");
	refs.sort((left, right) => left.ref.localeCompare(right.ref));
	return refs.map(({ oid, ref }) => `${oid}\t${ref}\n`).join("");
}

async function listLooseRefs(
	gitdir: string,
	relativePath: string,
): Promise<Array<{ oid: string; ref: string }>> {
	const refsPath = path.join(gitdir, relativePath);
	let entries: Dirent[];
	try {
		entries = await readdir(refsPath, { withFileTypes: true });
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const refs: Array<{ oid: string; ref: string }> = [];
	for (const entry of entries) {
		const entryRelativePath = path.join(relativePath, entry.name);
		if (entry.isDirectory()) {
			refs.push(...(await listLooseRefs(gitdir, entryRelativePath)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		refs.push({
			oid: (
				await readFile(path.join(gitdir, entryRelativePath), "utf8")
			).trim(),
			ref: entryRelativePath.split(path.sep).join("/"),
		});
	}
	return refs;
}

async function formatPacks(gitdir: string): Promise<string> {
	let entries: string[];
	try {
		entries = await readdir(path.join(gitdir, "objects", "pack"));
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return "";
		}
		throw error;
	}
	return entries
		.filter((entry) => entry.endsWith(".pack"))
		.sort()
		.map((entry) => `P ${entry}\n`)
		.join("");
}

type GitHttpRequestContext = {
	repositoryPath: string;
	pathPrefix: string;
	request: IncomingMessage;
	response: ServerResponse;
};

async function serveGitHttpRepository({
	repositoryPath,
	pathPrefix,
	request,
	response,
}: GitHttpRequestContext): Promise<void> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		response.writeHead(405, { allow: "GET, HEAD" });
		response.end();
		return;
	}
	const requestUrl = new URL(request.url ?? "/", "http://localhost");
	if (requestUrl.pathname === pathPrefix) {
		response.writeHead(301, { location: `${pathPrefix}/` });
		response.end();
		return;
	}
	if (!requestUrl.pathname.startsWith(`${pathPrefix}/`)) {
		response.writeHead(404);
		response.end();
		return;
	}
	const relativePath = decodeGitHttpPath(
		requestUrl.pathname.slice(pathPrefix.length + 1),
	);
	if (!relativePath) {
		response.writeHead(404);
		response.end();
		return;
	}
	const filePath = path.join(repositoryPath, relativePath);
	const escaped = path.relative(repositoryPath, filePath).startsWith("..");
	if (path.isAbsolute(relativePath) || escaped) {
		response.writeHead(403);
		response.end();
		return;
	}
	let fileStat: Stats;
	try {
		fileStat = await lstat(filePath);
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			response.writeHead(404);
			response.end();
			return;
		}
		throw error;
	}
	if (!fileStat.isFile()) {
		response.writeHead(404);
		response.end();
		return;
	}
	response.writeHead(200, {
		"cache-control": gitHttpCacheControl(relativePath),
		"content-length": fileStat.size,
		"content-type": gitHttpContentType(relativePath),
	});
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	nodeFs.createReadStream(filePath).pipe(response);
}

function decodeGitHttpPath(value: string): string | undefined {
	try {
		const segments = value
			.split("/")
			.map((segment) => decodeURIComponent(segment));
		if (
			segments.some(
				(segment) => !segment || segment === "." || segment === "..",
			)
		) {
			return undefined;
		}
		return path.join(...segments);
	} catch {
		return undefined;
	}
}

function gitHttpCacheControl(relativePath: string): string {
	return relativePath.startsWith(`objects${path.sep}`)
		? "public, max-age=31536000, immutable"
		: "no-cache";
}

function gitHttpContentType(relativePath: string): string {
	if (relativePath === "info/refs" || relativePath === "HEAD") {
		return "text/plain; charset=utf-8";
	}
	if (relativePath.endsWith(".pack")) {
		return "application/x-git-packed-objects";
	}
	if (relativePath.endsWith(".idx")) {
		return "application/x-git-packed-objects-toc";
	}
	return "application/octet-stream";
}

function defaultGitHttpPathPrefix(repoName: string): string {
	const repositoryName = repoName.endsWith(".git")
		? repoName
		: `${repoName}.git`;
	return `/${repositoryName.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizeHttpPathPrefix(value: string): string {
	const prefixed = value.startsWith("/") ? value : `/${value}`;
	const normalized = prefixed.replace(/\/+$/u, "");
	return normalized || "/repo.git";
}

function buildGitHttpUrl(
	hostname: string,
	address: AddressInfo,
	pathPrefix: string,
): string {
	const publicHostname =
		hostname === "0.0.0.0" || hostname === "::" ? "127.0.0.1" : hostname;
	const formattedHostname = publicHostname.includes(":")
		? `[${publicHostname}]`
		: publicHostname;
	return `http://${formattedHostname}:${address.port}${pathPrefix}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

async function pushSnapshotSource(
	rootPath: string,
	remoteGitdir: string,
	options: ResolvedOptions,
): Promise<PushResult> {
	const snapshotBranch =
		options.snapshotBranch ??
		`tmp/snapshot-${safeToken(os.userInfo().username)}-${timestamp()}-${Math.random().toString(16).slice(2, 8)}`;
	const snapshotWorktreePath = path.join(rootPath, "worktrees", "snapshot");
	const snapshotGitdir = path.join(snapshotWorktreePath, ".git");
	const baseCommit = await resolveCommit(
		options,
		options.sourceSha ?? options.sourceRef ?? "HEAD",
	);
	const snapshotRef = `refs/heads/${snapshotBranch}`;
	await mkdir(snapshotWorktreePath, { recursive: true });
	await git.init({
		defaultBranch: snapshotBranch,
		dir: snapshotWorktreePath,
		fs: nodeFs,
	});
	await copyObjectDatabase(options.sourceGitdir, snapshotGitdir);
	await git.writeRef({
		fs: nodeFs,
		gitdir: snapshotGitdir,
		force: true,
		ref: snapshotRef,
		value: baseCommit,
	});
	await git.checkout({
		dir: snapshotWorktreePath,
		fs: nodeFs,
		gitdir: snapshotGitdir,
		force: true,
		ref: snapshotRef,
	});
	await syncWorkspaceSnapshot(snapshotWorktreePath, options);
	const tree = await writeTreeFromDirectory(
		snapshotGitdir,
		snapshotWorktreePath,
	);
	const checkoutSha = await git.commit({
		author: gitAuthor,
		dir: snapshotWorktreePath,
		fs: nodeFs,
		gitdir: snapshotGitdir,
		message: options.snapshotMessage ?? "pretend-act checkout snapshot",
		ref: snapshotRef,
		noUpdateBranch: true,
		parent: [baseCommit],
		tree,
	});
	await copyObjectDatabase(snapshotGitdir, remoteGitdir);
	await git.writeRef({
		fs: nodeFs,
		gitdir: remoteGitdir,
		force: true,
		ref: snapshotRef,
		value: checkoutSha,
	});
	return {
		fetchRef: snapshotRef,
		checkoutSha,
		mode: "snapshot",
		snapshotBranch,
		snapshotWorktreePath,
	};
}

async function syncWorkspaceSnapshot(
	snapshotWorktreePath: string,
	options: ResolvedOptions,
): Promise<void> {
	const filter = await createWorkspaceFilter(options.workspacePath, {
		useGitIgnore: true,
		...options.workspaceFilter,
	});
	for (const entry of await readdir(snapshotWorktreePath)) {
		if (entry === ".git") {
			continue;
		}
		await removePath(path.join(snapshotWorktreePath, entry));
	}
	await copyFilteredWorkspaceTree(
		options.workspacePath,
		snapshotWorktreePath,
		options.workspacePath,
		filter.shouldCopy,
	);
}

async function copyFilteredWorkspaceTree(
	sourcePath: string,
	destinationPath: string,
	workspacePath: string,
	shouldCopy: (relativePath: string) => boolean,
): Promise<void> {
	const relativePath = path.relative(workspacePath, sourcePath);
	if (!shouldCopy(relativePath)) {
		return;
	}
	const stat = await lstat(sourcePath);
	if (stat.isDirectory()) {
		await mkdir(destinationPath, { recursive: true });
		for (const entry of await readdir(sourcePath)) {
			await copyFilteredWorkspaceTree(
				path.join(sourcePath, entry),
				path.join(destinationPath, entry),
				workspacePath,
				shouldCopy,
			);
		}
		return;
	}
	await mkdir(path.dirname(destinationPath), { recursive: true });
	if (stat.isSymbolicLink()) {
		await symlink(await readlink(sourcePath), destinationPath);
		return;
	}
	await cp(sourcePath, destinationPath, { force: true });
}

async function writeTreeFromDirectory(
	gitdir: string,
	directoryPath: string,
): Promise<string> {
	const entries = [];
	for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
		if (entry.name === ".git") {
			continue;
		}
		const entryPath = path.join(directoryPath, entry.name);
		const stat = await lstat(entryPath);
		if (stat.isDirectory()) {
			entries.push({
				mode: "040000",
				oid: await writeTreeFromDirectory(gitdir, entryPath),
				path: entry.name,
				type: "tree" as const,
			});
			continue;
		}
		if (stat.isSymbolicLink()) {
			entries.push({
				mode: "120000",
				oid: await git.writeObject({
					fs: nodeFs,
					gitdir,
					object: await readlink(entryPath),
					type: "blob",
				}),
				path: entry.name,
				type: "blob" as const,
			});
			continue;
		}
		entries.push({
			mode: stat.mode & 0o111 ? "100755" : "100644",
			oid: await git.writeObject({
				fs: nodeFs,
				gitdir,
				object: await readFile(entryPath),
				type: "blob",
			}),
			path: entry.name,
			type: "blob" as const,
		});
	}
	entries.sort((left, right) => left.path.localeCompare(right.path));
	return git.writeObject({
		format: "parsed",
		fs: nodeFs,
		gitdir,
		object: entries,
		type: "tree",
	});
}

async function resolveGitDir(dir: string): Promise<string> {
	const gitPath = path.join(dir, ".git");
	const stat = await lstat(gitPath);
	if (stat.isDirectory()) {
		return gitPath;
	}
	const content = await readFile(gitPath, "utf8");
	const match = /^gitdir:\s*(.+)$/u.exec(content.trim());
	if (!match) {
		throw new Error(`Unsupported .git file format at ${gitPath}`);
	}
	return path.resolve(dir, match[1]);
}

async function copyObjectDatabase(
	sourceGitdir: string,
	remoteGitdir: string,
): Promise<void> {
	await rm(path.join(remoteGitdir, "objects"), {
		force: true,
		recursive: true,
	});
	await cp(
		path.join(sourceGitdir, "objects"),
		path.join(remoteGitdir, "objects"),
		{
			force: true,
			recursive: true,
		},
	);
}

async function resolveCommit(
	options: ResolvedOptions,
	revision: string,
): Promise<string> {
	if (/^[0-9a-f]{40}$/iu.test(revision)) {
		await git.readCommit({
			fs: nodeFs,
			gitdir: options.sourceGitdir,
			oid: revision,
		});
		return revision;
	}
	const oid = await git.resolveRef({
		fs: nodeFs,
		gitdir: options.sourceGitdir,
		ref: revision,
	});
	return peelCommit(options.sourceGitdir, oid);
}

async function peelCommit(gitdir: string, oid: string): Promise<string> {
	try {
		await git.readCommit({ fs: nodeFs, gitdir, oid });
		return oid;
	} catch {
		const tag = await git.readTag({ fs: nodeFs, gitdir, oid });
		return peelCommit(gitdir, tag.tag.object);
	}
}

async function refExists(gitdir: string, ref: string): Promise<boolean> {
	try {
		await git.resolveRef({ fs: nodeFs, gitdir, ref });
		return true;
	} catch {
		return false;
	}
}

async function isCleanWorktree(options: ResolvedOptions): Promise<boolean> {
	const status = await git.statusMatrix({
		dir: options.workspacePath,
		fs: nodeFs,
		gitdir: options.sourceGitdir,
	});
	return status.every(([, head, workdir, stage]) => {
		return head === workdir && head === stage;
	});
}

function timestamp(): string {
	return new Date().toISOString().replace(/[-:]/gu, "").slice(0, 15);
}

function safeToken(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]/gu, "-");
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
