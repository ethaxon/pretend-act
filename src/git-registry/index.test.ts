import nodeFs from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import git from "isomorphic-git";
import { describe, expect, it } from "vitest";

import { createTempDirectory } from "../core/index";
import { createCheckoutMockStep, createGitRegistry } from "./index";

describe("git registry", () => {
	it("creates a snapshot remote with dirty, untracked, and deleted files", async () => {
		const workspacePath = await createFixtureRepository();
		try {
			await writeFile(path.join(workspacePath, "tracked.txt"), "dirty\n");
			await writeFile(path.join(workspacePath, "new.txt"), "new\n");
			await rm(path.join(workspacePath, "deleted.txt"));

			const registry = await createGitRegistry({ workspacePath });
			try {
				expect(registry.mode).toBe("snapshot");
				expect(
					await git.resolveRef({
						fs: nodeFs,
						gitdir: registry.gitdir,
						ref: registry.fetchRef,
					}),
				).toBe(registry.checkoutSha);
				const checkoutPath = await checkoutRegistry(
					registry.gitdir,
					registry.checkoutSha,
				);
				expect(
					await readFile(path.join(checkoutPath, "tracked.txt"), "utf8"),
				).toBe("dirty\n");
				expect(await readFile(path.join(checkoutPath, "new.txt"), "utf8")).toBe(
					"new\n",
				);
				await expect(
					readFile(path.join(checkoutPath, "deleted.txt"), "utf8"),
				).rejects.toMatchObject({ code: "ENOENT" });
			} finally {
				await registry.stop();
			}
		} finally {
			await rm(workspacePath, { force: true, recursive: true });
		}
	});

	it("publishes an explicit commit without dirty workspace changes", async () => {
		const workspacePath = await createFixtureRepository();
		try {
			const sourceSha = await git.resolveRef({
				fs: nodeFs,
				dir: workspacePath,
				ref: "HEAD",
			});
			await writeFile(path.join(workspacePath, "tracked.txt"), "dirty\n");

			const registry = await createGitRegistry({ workspacePath, sourceSha });
			try {
				expect(registry.mode).toBe("direct");
				expect(
					await git.resolveRef({
						fs: nodeFs,
						gitdir: registry.gitdir,
						ref: registry.fetchRef,
					}),
				).toBe(sourceSha);
				const checkoutPath = await checkoutRegistry(
					registry.gitdir,
					registry.checkoutSha,
				);
				expect(
					await readFile(path.join(checkoutPath, "tracked.txt"), "utf8"),
				).toBe("clean\n");
			} finally {
				await registry.stop();
			}
		} finally {
			await rm(workspacePath, { force: true, recursive: true });
		}
	});

	it("serves a registry through optional HTTP transport", async () => {
		const workspacePath = await createFixtureRepository();
		try {
			const registry = await createGitRegistry({
				transport: "http",
				workspacePath,
			});
			try {
				expect(registry.transport).toBe("http");
				expect(registry.http?.remoteUrl).toBe(registry.remoteUrl);
				const infoRefs = await fetch(
					`${registry.remoteUrl}/info/refs?service=git-upload-pack`,
				);
				expect(infoRefs.status).toBe(200);
				expect(await infoRefs.text()).toContain(
					`${registry.checkoutSha}\t${registry.fetchRef}`,
				);

				const objectResponse = await fetch(
					`${registry.remoteUrl}/objects/${registry.checkoutSha.slice(0, 2)}/${registry.checkoutSha.slice(2)}`,
				);
				expect(objectResponse.status).toBe(200);
				expect(
					Number(objectResponse.headers.get("content-length")),
				).toBeGreaterThan(0);
			} finally {
				await registry.stop();
			}
		} finally {
			await rm(workspacePath, { force: true, recursive: true });
		}
	});

	it("builds a checkout replacement step for workflow overlays", () => {
		expect(
			createCheckoutMockStep({
				checkoutSha: "abc123",
				fetchRef: "refs/heads/tmp/snapshot",
				remoteUrl: "http://127.0.0.1:8174/repo.git",
			}),
		).toMatchObject({
			run: expect.stringContaining("git fetch --no-tags --prune origin"),
		});
	});
});

async function createFixtureRepository(): Promise<string> {
	const workspacePath = await createTempDirectory("pretend-act-git-fixture-");
	await git.init({ defaultBranch: "main", dir: workspacePath, fs: nodeFs });
	await mkdir(path.join(workspacePath, "src"), { recursive: true });
	await writeFile(path.join(workspacePath, "tracked.txt"), "clean\n");
	await writeFile(path.join(workspacePath, "deleted.txt"), "delete me\n");
	await writeFile(path.join(workspacePath, ".gitignore"), "ignored.txt\n");
	await git.add({ dir: workspacePath, filepath: "tracked.txt", fs: nodeFs });
	await git.add({ dir: workspacePath, filepath: "deleted.txt", fs: nodeFs });
	await git.add({ dir: workspacePath, filepath: ".gitignore", fs: nodeFs });
	await git.commit({
		author: { email: "pretend-act@example.invalid", name: "Pretend Act" },
		dir: workspacePath,
		fs: nodeFs,
		message: "initial",
	});
	return workspacePath;
}

async function checkoutRegistry(gitdir: string, ref: string): Promise<string> {
	const checkoutPath = await createTempDirectory("pretend-act-git-checkout-");
	await git.checkout({
		dir: checkoutPath,
		force: true,
		fs: nodeFs,
		gitdir,
		ref,
	});
	return checkoutPath;
}
