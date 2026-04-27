import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { createTempDirectory, removePath } from "../core/index";
import { createNpmRegistryConfig, type NpmRegistryConfig } from "./index";

export type NpmRegistryService = NpmRegistryConfig & {
	rootPath: string;
	storagePath: string;
	process: ChildProcess;
	stop(): Promise<void>;
};

export type StartNpmRegistryOptions = {
	rootPath?: string;
	command?: string;
	port?: number;
	token?: string;
	scope?: string;
	keepOnStop?: boolean;
};

export async function startNpmRegistry(
	options: StartNpmRegistryOptions = {},
): Promise<NpmRegistryService> {
	const rootPath =
		options.rootPath ?? (await createTempDirectory("pretend-act-npm-"));
	const storagePath = path.join(rootPath, "storage");
	const configPath = path.join(rootPath, "config.yaml");
	const port = options.port ?? (await getFreePort());
	const registryUrl = `http://127.0.0.1:${port}/`;
	await mkdir(storagePath, { recursive: true });
	await writeFile(configPath, verdaccioConfig(storagePath), "utf8");

	const child = spawn(
		options.command ?? "verdaccio",
		["-c", configPath, "-l", registryUrl],
		{
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	await waitForHttp(`${registryUrl}-/ping`);

	return {
		...createNpmRegistryConfig({
			registryUrl,
			token: options.token ?? "pretend-act-npm-token",
			scope: options.scope,
		}),
		rootPath,
		storagePath,
		process: child,
		async stop() {
			child.kill("SIGTERM");
			if (!options.keepOnStop) {
				await removePath(rootPath);
			}
		},
	};
}

function verdaccioConfig(storagePath: string): string {
	return `storage: ${JSON.stringify(storagePath)}
auth:
  htpasswd:
    file: ./htpasswd
uplinks: {}
packages:
  "**":
    access: $all
    publish: $all
    unpublish: $all
logs:
  - { type: stdout, format: pretty, level: warn }
`;
}

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === "object") {
					resolve(address.port);
				} else {
					reject(new Error("Could not allocate a port."));
				}
			});
		});
		server.on("error", reject);
	});
}

async function waitForHttp(url: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Retry until the service accepts connections.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for ${url}`);
}
