import net from "node:net";

import { spawnCommand } from "../core/index";

export type DockerRegistryService = {
	registryUrl: string;
	imagePrefix: string;
	containerName: string;
	stop(): Promise<void>;
};

export type StartDockerRegistryOptions = {
	containerCli?: string;
	image?: string;
	port?: number;
	containerName?: string;
	keepOnStop?: boolean;
};

export async function startDockerRegistry(
	options: StartDockerRegistryOptions = {},
): Promise<DockerRegistryService> {
	const containerCli = options.containerCli ?? "docker";
	const port = options.port ?? (await getFreePort());
	const containerName =
		options.containerName ?? `pretend-act-registry-${process.pid}-${port}`;
	await spawnCommand({
		command: containerCli,
		args: [
			"run",
			"-d",
			"--rm",
			"--name",
			containerName,
			"-p",
			`127.0.0.1:${port}:5000`,
			options.image ?? "registry:3",
		],
	});
	const registryUrl = `127.0.0.1:${port}`;
	await waitForRegistry(`http://${registryUrl}/v2/`);
	return {
		registryUrl,
		imagePrefix: registryUrl,
		containerName,
		async stop() {
			if (!options.keepOnStop) {
				await spawnCommand({
					command: containerCli,
					args: ["rm", "-f", containerName],
				});
			}
		},
	};
}

export async function assertDockerRegistryReachable(
	registryUrl: string,
): Promise<void> {
	await waitForRegistry(`http://${registryUrl}/v2/`);
}

async function waitForRegistry(url: string): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// Retry until Docker publishes the registry port.
		}
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	throw new Error(`Timed out waiting for Docker registry at ${url}`);
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
