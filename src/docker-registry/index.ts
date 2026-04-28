import net from "node:net";

import type Dockerode from "dockerode";

import { importOptionalPeer } from "../core/index";

type DockerodeModule = {
	default: new (options?: Dockerode.DockerOptions) => Dockerode;
};

export type DockerRegistryService = AsyncDisposable & {
	registryUrl: string;
	imagePrefix: string;
	containerName: string;
	containerId: string;
	container: Dockerode.Container;
	stop(): Promise<void>;
};

export type StartDockerRegistryOptions = {
	docker?: Dockerode;
	dockerOptions?: Dockerode.DockerOptions;
	image?: string;
	port?: number;
	containerName?: string;
	keepOnStop?: boolean;
	pullImage?: boolean;
	startupTimeoutMs?: number;
};

export async function startDockerRegistry(
	options: StartDockerRegistryOptions = {},
): Promise<DockerRegistryService> {
	const docker =
		options.docker ?? (await createDockerode(options.dockerOptions));
	const image = options.image ?? "registry:3";
	const port = options.port ?? (await getFreePort());
	const containerName =
		options.containerName ?? `pretend-act-registry-${process.pid}-${port}`;
	if (options.pullImage ?? true) {
		await pullImage(docker, image);
	}
	const container = await docker.createContainer({
		Image: image,
		name: containerName,
		ExposedPorts: { "5000/tcp": {} },
		HostConfig: {
			PortBindings: {
				"5000/tcp": [{ HostIp: "127.0.0.1", HostPort: String(port) }],
			},
		},
	});
	try {
		await container.start();
	} catch (error) {
		await removeContainer(container);
		throw error;
	}
	const registryUrl = `127.0.0.1:${port}`;
	try {
		await waitForRegistry(
			`http://${registryUrl}/v2/`,
			options.startupTimeoutMs,
		);
	} catch (error) {
		await removeContainer(container);
		throw error;
	}
	async function stop() {
		if (!options.keepOnStop) {
			await removeContainer(container);
		}
	}

	return {
		registryUrl,
		imagePrefix: registryUrl,
		containerName,
		containerId: container.id,
		container,
		stop,
		async [Symbol.asyncDispose]() {
			await stop();
		},
	};
}

async function createDockerode(
	options: Dockerode.DockerOptions | undefined,
): Promise<Dockerode> {
	const Dockerode = await importOptionalPeer<DockerodeModule>(
		"dockerode",
		"docker registry",
	);
	return new Dockerode.default(options);
}

export async function assertDockerRegistryReachable(
	registryUrl: string,
): Promise<void> {
	await waitForRegistry(`http://${registryUrl}/v2/`);
}

async function waitForRegistry(url: string, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
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

async function pullImage(docker: Dockerode, image: string): Promise<void> {
	try {
		await docker.getImage(image).inspect();
		return;
	} catch {
		const stream = await docker.pull(image);
		await followDockerProgress(docker, stream);
	}
}

async function followDockerProgress(
	docker: Dockerode,
	stream: NodeJS.ReadableStream,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		docker.modem.followProgress(stream, (error: unknown) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

async function removeContainer(container: Dockerode.Container): Promise<void> {
	try {
		await container.remove({ force: true });
	} catch (error) {
		if (!isDockerNotFoundError(error)) {
			throw error;
		}
	}
}

function isDockerNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"statusCode" in error &&
		error.statusCode === 404
	);
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
