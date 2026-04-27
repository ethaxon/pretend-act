import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import net from "node:net";
import path from "node:path";

import { createTempDirectory, removePath } from "../core/index";
import { type CargoRegistryConfig, createCargoRegistryConfig } from "./index";

type CratesRegistryState = {
	owners: Map<string, Map<string, CrateOwner>>;
	token: string;
	versions: Map<string, Map<string, PublishedCrateVersion>>;
};

type CrateOwner = {
	id: number;
	login: string;
	name: string | null;
};

type PublishedCrateVersion = {
	archivePath: string;
	checksum: string;
	metadata: CargoPublishMetadata;
	publishedAt: string;
	yanked: boolean;
};

type CargoPublishDependency = {
	name: string;
	version_req: string;
	features?: string[];
	optional?: boolean;
	default_features?: boolean;
	target?: string | null;
	kind?: "normal" | "build" | "dev" | string | null;
	registry?: string | null;
	explicit_name_in_toml?: string | null;
};

type CargoPublishMetadata = {
	name: string;
	vers: string;
	deps?: CargoPublishDependency[];
	features?: Record<string, string[]>;
	links?: string | null;
	description?: string | null;
	rust_version?: string | null;
};

export type CratesRegistryService = CargoRegistryConfig & {
	rootPath: string;
	registryUrl: string;
	indexUrl: string;
	stop(): Promise<void>;
};

export type StartCratesRegistryOptions = {
	name?: string;
	rootPath?: string;
	port?: number;
	token?: string;
	keepOnStop?: boolean;
};

export async function startCratesRegistry(
	options: StartCratesRegistryOptions = {},
): Promise<CratesRegistryService> {
	const rootPath =
		options.rootPath ?? (await createTempDirectory("pretend-act-crates-"));
	const port = options.port ?? (await getFreePort());
	const registryUrl = `http://127.0.0.1:${port}`;
	const indexUrl = `sparse+${registryUrl}/index/`;
	await mkdir(path.join(rootPath, "crates"), { recursive: true });
	const state: CratesRegistryState = {
		owners: new Map(),
		token: options.token ?? "pretend-act-crates-token",
		versions: new Map(),
	};

	const server = createServer((request, response) => {
		void handleRequest(rootPath, registryUrl, state, request, response);
	});
	await listen(server, port);

	return {
		...createCargoRegistryConfig({
			name: options.name ?? "pretend-act",
			indexUrl,
			token: state.token,
		}),
		rootPath,
		registryUrl,
		indexUrl,
		async stop() {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			if (!options.keepOnStop) {
				await removePath(rootPath);
			}
		},
	};
}

async function handleRequest(
	rootPath: string,
	registryUrl: string,
	state: CratesRegistryState,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const url = new URL(request.url ?? "/", registryUrl);
	if (request.method === "GET" && url.pathname === "/me") {
		response.writeHead(200, { "content-type": "text/plain" });
		response.end("Use the token configured by startCratesRegistry().\n");
		return;
	}
	if (request.method === "GET" && url.pathname === "/index/config.json") {
		json(response, {
			dl: `${registryUrl}/api/v1/crates/{crate}/{version}/download`,
			api: registryUrl,
		});
		return;
	}
	if (request.method === "GET" && url.pathname.startsWith("/index/")) {
		await sendFile(response, path.join(rootPath, url.pathname.slice(1)));
		return;
	}
	if (request.method === "GET" && url.pathname === "/api/v1/crates") {
		searchCrates(state, url, response);
		return;
	}
	if (request.method === "PUT" && url.pathname === "/api/v1/crates/new") {
		if (!isAuthorized(request, state.token)) {
			unauthorized(response);
			return;
		}
		const body = await readBody(request);
		const crate = parseCargoPublishBody(body);
		const validationError = validatePublish(state, crate.metadata);
		if (validationError) {
			jsonError(response, validationError, 400);
			return;
		}
		const cratePath = path.join(
			rootPath,
			"crates",
			`${crate.metadata.name}-${crate.metadata.vers}.crate`,
		);
		await writeFile(cratePath, crate.archive);
		const checksum = createHash("sha256").update(crate.archive).digest("hex");
		const versions = state.versions.get(crate.metadata.name) ?? new Map();
		versions.set(crate.metadata.vers, {
			archivePath: cratePath,
			checksum,
			metadata: crate.metadata,
			publishedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
			yanked: false,
		});
		state.versions.set(crate.metadata.name, versions);
		ensureDefaultOwner(state, crate.metadata.name);
		await writeIndexFile(rootPath, crate.metadata.name, versions);
		json(response, {
			warnings: {
				invalid_categories: [],
				invalid_badges: [],
				other: [],
			},
		});
		return;
	}
	if (
		request.method === "DELETE" &&
		/^\/api\/v1\/crates\/[^/]+\/[^/]+\/yank$/u.test(url.pathname)
	) {
		await setYanked(rootPath, state, request, response, url, true);
		return;
	}
	if (
		request.method === "PUT" &&
		/^\/api\/v1\/crates\/[^/]+\/[^/]+\/unyank$/u.test(url.pathname)
	) {
		await setYanked(rootPath, state, request, response, url, false);
		return;
	}
	if (
		/^\/api\/v1\/crates\/[^/]+\/owners$/u.test(url.pathname) &&
		["DELETE", "GET", "PUT"].includes(request.method ?? "")
	) {
		await handleOwners(state, request, response, url);
		return;
	}
	if (
		request.method === "GET" &&
		/^\/api\/v1\/crates\/[^/]+\/[^/]+$/u.test(url.pathname)
	) {
		const [, , , , crateName, version] = url.pathname.split("/");
		const crateVersion = state.versions.get(crateName)?.get(version);
		if (!crateVersion) {
			jsonError(response, "crate version not found", 404);
			return;
		}
		json(response, {
			version: {
				crate: crateName,
				num: version,
				checksum: crateVersion.checksum,
				yanked: crateVersion.yanked,
			},
		});
		return;
	}
	if (
		request.method === "GET" &&
		/^\/api\/v1\/crates\/[^/]+\/[^/]+\/download$/u.test(url.pathname)
	) {
		const [, , , , crateName, version] = url.pathname.split("/");
		const crateVersion = state.versions.get(crateName)?.get(version);
		if (!crateVersion) {
			jsonError(response, "crate version not found", 404);
			return;
		}
		await sendFile(response, crateVersion.archivePath);
		return;
	}
	jsonError(response, "not found", 404);
}

function parseCargoPublishBody(body: Buffer): {
	archive: Buffer;
	metadata: CargoPublishMetadata;
} {
	if (body.length < 8) {
		throw new Error("Cargo publish body is too short.");
	}
	const jsonLength = body.readUInt32LE(0);
	const metadata = JSON.parse(
		body.subarray(4, 4 + jsonLength).toString("utf8"),
	) as CargoPublishMetadata;
	const archiveLengthOffset = 4 + jsonLength;
	const archiveLength = body.readUInt32LE(archiveLengthOffset);
	const archive = body.subarray(
		archiveLengthOffset + 4,
		archiveLengthOffset + 4 + archiveLength,
	);
	return { metadata, archive };
}

async function writeIndexFile(
	rootPath: string,
	name: string,
	versions: Map<string, PublishedCrateVersion>,
): Promise<void> {
	const indexPath = path.join(rootPath, "index", crateIndexPath(name));
	await mkdir(path.dirname(indexPath), { recursive: true });
	await writeFile(
		indexPath,
		`${[...versions.values()].map(toIndexLine).join("\n")}\n`,
		"utf8",
	);
}

function toIndexLine(version: PublishedCrateVersion): string {
	const metadata = version.metadata;
	return JSON.stringify({
		name: metadata.name,
		vers: metadata.vers,
		deps: (metadata.deps ?? []).map(toIndexDependency),
		cksum: version.checksum,
		features: metadata.features ?? {},
		yanked: version.yanked,
		links: metadata.links ?? null,
		v: 2,
		rust_version: metadata.rust_version ?? null,
		pubtime: version.publishedAt,
	});
}

function toIndexDependency(dependency: CargoPublishDependency) {
	return {
		name: dependency.explicit_name_in_toml ?? dependency.name,
		req: dependency.version_req,
		features: dependency.features ?? [],
		optional: dependency.optional ?? false,
		default_features: dependency.default_features ?? true,
		target: dependency.target ?? null,
		kind: dependency.kind ?? "normal",
		registry: dependency.registry ?? null,
		package: dependency.explicit_name_in_toml ? dependency.name : null,
	};
}

async function setYanked(
	rootPath: string,
	state: CratesRegistryState,
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
	yanked: boolean,
): Promise<void> {
	if (!isAuthorized(request, state.token)) {
		unauthorized(response);
		return;
	}
	const [, , , , crateName, version] = url.pathname.split("/");
	const versions = state.versions.get(crateName);
	const crateVersion = versions?.get(version);
	if (!versions || !crateVersion) {
		jsonError(response, "crate version not found", 404);
		return;
	}
	crateVersion.yanked = yanked;
	await writeIndexFile(rootPath, crateName, versions);
	json(response, { ok: true });
}

async function handleOwners(
	state: CratesRegistryState,
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<void> {
	if (!isAuthorized(request, state.token)) {
		unauthorized(response);
		return;
	}
	const [, , , , crateName] = url.pathname.split("/");
	if (!state.versions.has(crateName)) {
		jsonError(response, "crate not found", 404);
		return;
	}
	const owners = ensureDefaultOwner(state, crateName);
	if (request.method === "GET") {
		json(response, { users: [...owners.values()] });
		return;
	}
	const body = (await readJsonBody(request)) as { users?: string[] };
	const users = body.users ?? [];
	if (request.method === "PUT") {
		for (const login of users) {
			owners.set(login, {
				id: ownerId(login),
				login,
				name: login,
			});
		}
		json(response, {
			ok: true,
			msg: `owners added to crate ${crateName}`,
		});
		return;
	}
	for (const login of users) {
		owners.delete(login);
	}
	json(response, {
		ok: true,
		msg: "owners successfully removed",
	});
}

function searchCrates(
	state: CratesRegistryState,
	url: URL,
	response: ServerResponse,
): void {
	const query = (url.searchParams.get("q") ?? "").toLowerCase();
	const perPage = Math.min(
		Number.parseInt(url.searchParams.get("per_page") ?? "10", 10) || 10,
		100,
	);
	const crates = [...state.versions.entries()]
		.map(([name, versions]) => ({ name, version: highestVersion(versions) }))
		.filter(({ name, version }) => {
			return (
				version &&
				(!query ||
					name.toLowerCase().includes(query) ||
					(version.metadata.description ?? "").toLowerCase().includes(query))
			);
		});
	json(response, {
		crates: crates.slice(0, perPage).map(({ name, version }) => ({
			name,
			max_version: version?.metadata.vers,
			description: version?.metadata.description ?? null,
		})),
		meta: { total: crates.length },
	});
}

function highestVersion(
	versions: Map<string, PublishedCrateVersion>,
): PublishedCrateVersion | undefined {
	return [...versions.values()].sort((left, right) =>
		left.metadata.vers.localeCompare(right.metadata.vers, undefined, {
			numeric: true,
		}),
	)[versions.size - 1];
}

function validatePublish(
	state: CratesRegistryState,
	metadata: CargoPublishMetadata,
): string | undefined {
	if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(metadata.name)) {
		return "invalid crate name";
	}
	if (!metadata.vers) {
		return "missing crate version";
	}
	const versions = state.versions.get(metadata.name);
	if (!versions) {
		return undefined;
	}
	const versionKey = metadata.vers.split("+", 1)[0];
	for (const existingVersion of versions.keys()) {
		if (existingVersion.split("+", 1)[0] === versionKey) {
			return "crate version already exists";
		}
	}
	return undefined;
}

function ensureDefaultOwner(
	state: CratesRegistryState,
	crateName: string,
): Map<string, CrateOwner> {
	const existingOwners = state.owners.get(crateName);
	if (existingOwners) {
		return existingOwners;
	}
	const owners = new Map<string, CrateOwner>();
	owners.set("pretend-act", {
		id: ownerId("pretend-act"),
		login: "pretend-act",
		name: "Pretend Act",
	});
	state.owners.set(crateName, owners);
	return owners;
}

function ownerId(login: string): number {
	const digest = createHash("sha256").update(login).digest();
	return digest.readUInt32BE(0);
}

function crateIndexPath(name: string): string {
	const normalizedName = name.toLowerCase();
	if (normalizedName.length === 1) return `1/${normalizedName}`;
	if (normalizedName.length === 2) return `2/${normalizedName}`;
	if (normalizedName.length === 3) {
		return `3/${normalizedName[0]}/${normalizedName}`;
	}
	return `${normalizedName.slice(0, 2)}/${normalizedName.slice(2, 4)}/${normalizedName}`;
}

function json(response: ServerResponse, value: unknown, status = 200): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(value));
}

function jsonError(
	response: ServerResponse,
	detail: string,
	status = 400,
): void {
	json(response, { errors: [{ detail }] }, status);
}

function unauthorized(response: ServerResponse): void {
	response.setHeader("www-authenticate", 'Cargo login_url="/me"');
	jsonError(response, "invalid or missing token", 403);
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
	const authorization = request.headers.authorization;
	return authorization === token || authorization === `Bearer ${token}`;
}

async function sendFile(
	response: ServerResponse,
	filePath: string,
): Promise<void> {
	try {
		response.writeHead(200, { "content-type": "application/octet-stream" });
		response.end(await readFile(filePath));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			json(response, { error: "not found" }, 404);
			return;
		}
		throw error;
	}
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
	const body = await readBody(request);
	if (body.length === 0) {
		return {};
	}
	return JSON.parse(body.toString("utf8"));
}

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === "object") resolve(address.port);
				else reject(new Error("Could not allocate a port."));
			});
		});
		server.on("error", reject);
	});
}

async function listen(
	server: ReturnType<typeof createServer>,
	port: number,
): Promise<void> {
	await new Promise<void>((resolve) =>
		server.listen(port, "127.0.0.1", resolve),
	);
}
