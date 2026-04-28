import nodeFs from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import git from "isomorphic-git";
import { describe, expect, it } from "vitest";

import {
	createDisposableTempDirectory,
	type DisposableTempDirectory,
} from "../core/index";
import { createCheckoutReplacementStep, createGitRegistry } from "./index";

describe("git registry", () => {
	it("creates a snapshot remote with dirty, untracked, and deleted files", async () => {
		const workspace = await createFixtureRepository();
		try {
			const workspacePath = workspace.path;
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
				const checkout = await checkoutRegistry(
					registry.gitdir,
					registry.checkoutSha,
				);
				try {
					expect(
						await readFile(path.join(checkout.path, "tracked.txt"), "utf8"),
					).toBe("dirty\n");
					expect(
						await readFile(path.join(checkout.path, "new.txt"), "utf8"),
					).toBe("new\n");
					await expect(
						readFile(path.join(checkout.path, "deleted.txt"), "utf8"),
					).rejects.toMatchObject({ code: "ENOENT" });
				} finally {
					await checkout.remove();
				}
			} finally {
				await registry.stop();
			}
		} finally {
			await workspace.remove();
		}
	});

	it("publishes an explicit commit without dirty workspace changes", async () => {
		const workspace = await createFixtureRepository();
		try {
			const workspacePath = workspace.path;
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
				const checkout = await checkoutRegistry(
					registry.gitdir,
					registry.checkoutSha,
				);
				try {
					expect(
						await readFile(path.join(checkout.path, "tracked.txt"), "utf8"),
					).toBe("clean\n");
				} finally {
					await checkout.remove();
				}
			} finally {
				await registry.stop();
			}
		} finally {
			await workspace.remove();
		}
	});

	it("serves a registry through optional HTTP transport", async () => {
		const workspace = await createFixtureRepository();
		try {
			const registry = await createGitRegistry({
				transport: "http",
				workspacePath: workspace.path,
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
			await workspace.remove();
		}
	});

	it("builds a checkout replacement step for workflow overlays", () => {
		expect(
			createCheckoutReplacementStep({
				checkoutSha: "abc123",
				fetchRef: "refs/heads/tmp/snapshot",
				remoteUrl: "http://127.0.0.1:8174/repo.git",
			}),
		).toMatchObject({
			run: expect.stringContaining("git fetch --no-tags --prune origin"),
		});
	});

	it("cleans up through the async disposable protocol", async () => {
		const workspace = await createFixtureRepository();
		try {
			const registry = await createGitRegistry({
				workspacePath: workspace.path,
			});
			const rootPath = registry.rootPath;
			await registry[Symbol.asyncDispose]();
			await expect(lstat(rootPath)).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await workspace.remove();
		}
	});
});

async function createFixtureRepository(): Promise<DisposableTempDirectory> {
	const workspace = await createDisposableTempDirectory(
		"pretend-act-git-fixture-",
	);
	const workspacePath = workspace.path;
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
	return workspace;
}

async function checkoutRegistry(
	gitdir: string,
	ref: string,
): Promise<DisposableTempDirectory> {
	const checkout = await createDisposableTempDirectory(
		"pretend-act-git-checkout-",
	);
	await git.checkout({
		dir: checkout.path,
		force: true,
		fs: nodeFs,
		gitdir,
		ref,
	});
	return checkout;
}
