import { afterEach, describe, expect, it, vi } from "vitest";

import { startDockerRegistry } from "./index";

describe("docker registry", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("starts and removes a registry container through dockerode", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 200 })),
		);
		const container = new FakeDockerContainer("container-id");
		const docker = new FakeDocker(container);

		const registry = await startDockerRegistry({
			containerName: "pretend-registry",
			docker: docker as never,
			image: "registry:3",
			port: 5123,
			pullImage: false,
		});

		expect(docker.createOptions).toMatchObject({
			Image: "registry:3",
			name: "pretend-registry",
			ExposedPorts: { "5000/tcp": {} },
			HostConfig: {
				PortBindings: {
					"5000/tcp": [{ HostIp: "127.0.0.1", HostPort: "5123" }],
				},
			},
		});
		expect(container.started).toBe(true);
		expect(registry).toMatchObject({
			containerId: "container-id",
			containerName: "pretend-registry",
			imagePrefix: "127.0.0.1:5123",
			registryUrl: "127.0.0.1:5123",
		});

		await registry.stop();

		expect(container.removeOptions).toEqual({ force: true });
	});

	it("keeps the registry container when requested", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 200 })),
		);
		const container = new FakeDockerContainer("container-id");
		const docker = new FakeDocker(container);

		const registry = await startDockerRegistry({
			docker: docker as never,
			keepOnStop: true,
			port: 5124,
			pullImage: false,
		});

		await registry.stop();

		expect(container.removeOptions).toBeUndefined();
	});
});

class FakeDocker {
	createOptions: unknown;

	constructor(private readonly container: FakeDockerContainer) {}

	async createContainer(options: unknown): Promise<FakeDockerContainer> {
		this.createOptions = options;
		return this.container;
	}
}

class FakeDockerContainer {
	started = false;
	removeOptions: unknown;

	constructor(readonly id: string) {}

	async start(): Promise<void> {
		this.started = true;
	}

	async remove(options: unknown): Promise<void> {
		this.removeOptions = options;
	}
}
