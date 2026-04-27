import { describe, expect, it } from "vitest";

import { startCratesRegistry } from "./index";

describe("crates registry server", () => {
	it("accepts a crates.io publish payload and exposes metadata", async () => {
		const registry = await startCratesRegistry({ name: "local" });
		try {
			const headers = authHeaders(registry.env);
			const publishResponse = await fetch(
				`${registry.registryUrl}/api/v1/crates/new`,
				{
					body: publishBody(
						{ name: "demo", vers: "1.2.3", description: "Demo crate" },
						"fake crate archive",
					),
					headers,
					method: "PUT",
				},
			);

			expect(publishResponse.ok).toBe(true);
			expect(await publishResponse.json()).toMatchObject({
				warnings: { invalid_categories: [], invalid_badges: [], other: [] },
			});
			expect(
				await fetch(`${registry.registryUrl}/api/v1/crates/demo/1.2.3`).then(
					(response) => response.json(),
				),
			).toMatchObject({
				version: { crate: "demo", num: "1.2.3", yanked: false },
			});
			expect(
				await fetch(
					`${registry.registryUrl}/api/v1/crates/demo/1.2.3/download`,
				).then((response) => response.text()),
			).toBe("fake crate archive");
			expect(
				await fetch(`${registry.registryUrl}/index/de/mo/demo`).then(
					(response) => response.text(),
				),
			).toContain('"vers":"1.2.3"');
		} finally {
			await registry.stop();
		}
	});

	it("requires auth for mutating Cargo Web API endpoints", async () => {
		const registry = await startCratesRegistry({ name: "local" });
		try {
			const response = await fetch(
				`${registry.registryUrl}/api/v1/crates/new`,
				{
					body: publishBody({ name: "demo", vers: "1.2.3" }, "archive"),
					method: "PUT",
				},
			);

			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({
				errors: [{ detail: "invalid or missing token" }],
			});
		} finally {
			await registry.stop();
		}
	});

	it("supports yank, unyank, owners, and search", async () => {
		const registry = await startCratesRegistry({ name: "local" });
		try {
			const headers = authHeaders(registry.env);
			await publishCrate(registry.registryUrl, headers, {
				name: "demo",
				vers: "1.2.3",
				description: "Find me",
			});

			const yankResponse = await fetch(
				`${registry.registryUrl}/api/v1/crates/demo/1.2.3/yank`,
				{ headers, method: "DELETE" },
			);
			expect(await yankResponse.json()).toEqual({ ok: true });
			expect(
				await fetch(`${registry.registryUrl}/index/de/mo/demo`).then(
					(response) => response.text(),
				),
			).toContain('"yanked":true');

			const unyankResponse = await fetch(
				`${registry.registryUrl}/api/v1/crates/demo/1.2.3/unyank`,
				{ headers, method: "PUT" },
			);
			expect(await unyankResponse.json()).toEqual({ ok: true });
			expect(
				await fetch(`${registry.registryUrl}/index/de/mo/demo`).then(
					(response) => response.text(),
				),
			).toContain('"yanked":false');

			await fetch(`${registry.registryUrl}/api/v1/crates/demo/owners`, {
				body: JSON.stringify({ users: ["github:example:owner"] }),
				headers: { ...headers, "content-type": "application/json" },
				method: "PUT",
			});
			expect(
				await fetch(`${registry.registryUrl}/api/v1/crates/demo/owners`, {
					headers,
				}).then((response) => response.json()),
			).toMatchObject({
				users: expect.arrayContaining([
					expect.objectContaining({ login: "github:example:owner" }),
				]),
			});

			expect(
				await fetch(`${registry.registryUrl}/api/v1/crates?q=find`).then(
					(response) => response.json(),
				),
			).toMatchObject({
				crates: [{ name: "demo", max_version: "1.2.3" }],
				meta: { total: 1 },
			});
		} finally {
			await registry.stop();
		}
	});
});

async function publishCrate(
	registryUrl: string,
	headers: Record<string, string>,
	metadata: { name: string; vers: string; description?: string },
): Promise<void> {
	const response = await fetch(`${registryUrl}/api/v1/crates/new`, {
		body: publishBody(metadata, "fake crate archive"),
		headers,
		method: "PUT",
	});
	expect(response.ok).toBe(true);
}

function authHeaders(env: Record<string, string>): Record<string, string> {
	return { authorization: Object.values(env)[0] ?? "" };
}

function publishBody(metadata: unknown, archiveContent: string): Blob {
	const archive = Buffer.from(archiveContent);
	const encodedMetadata = Buffer.from(JSON.stringify(metadata));
	return new Blob([
		Buffer.concat([
			uint32(encodedMetadata.length),
			encodedMetadata,
			uint32(archive.length),
			archive,
		]),
	]);
}

function uint32(value: number): Buffer {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(value, 0);
	return buffer;
}
