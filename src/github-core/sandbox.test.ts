import nodeFs from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { InjectionToken } from "injection-js";
import git from "isomorphic-git";
import { describe, expect, it } from "vitest";

import { createDisposableTempDirectory } from "../core/index";
import { createGithubActionsContainer } from "./sandbox";
import {
	GithubActionsWorkspaceToken,
	GithubCheckoutBackendToken,
} from "./tokens";

const CustomServiceToken = new InjectionToken<string>("custom service");

describe("github actions container", () => {
	it("creates a checkout backend for actions/checkout replacements", async () => {
		const workspace = await createFixtureRepository();
		try {
			await using container = await createGithubActionsContainer({
				providers: [{ provide: CustomServiceToken, useValue: "custom" }],
				repository: {
					name: "repo",
					sandbox: { initializeGit: false },
					source: { path: workspace.path },
				},
			});
			const checkout = container.require(GithubCheckoutBackendToken);
			const rootPath = container.workspace.rootPath;
			expect(container.require(GithubActionsWorkspaceToken).repoPath).toBe(
				container.workspace.repoPath,
			);
			expect(container.require(CustomServiceToken)).toBe("custom");
			expect(checkout.transport).toBe("http");
			expect(checkout.remoteUrl).toContain("repo.git");
			expect(checkout.fetchRef).toMatch(/^refs\/heads\/tmp\/snapshot-/);
			expect(checkout.checkoutSha).toMatch(/^[0-9a-f]{40}$/);
			await container.cleanup();
			await expect(lstat(rootPath)).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await workspace.remove();
		}
	});

	it("can keep the sandbox as a copy-only workspace", async () => {
		const workspace = await createDisposableTempDirectory(
			"pretend-act-copy-workspace-",
		);
		try {
			await writeFile(path.join(workspace.path, "README.md"), "copy\n");
			await using container = await createGithubActionsContainer({
				repository: {
					checkout: false,
					name: "repo",
					sandbox: { initializeGit: false },
					source: { path: workspace.path },
				},
			});
			expect(container.get(GithubCheckoutBackendToken)).toBeUndefined();
			expect(
				await readFile(
					path.join(container.workspace.repoPath, "README.md"),
					"utf8",
				),
			).toBe("copy\n");
		} finally {
			await workspace.remove();
		}
	});
});

async function createFixtureRepository() {
	const workspace = await createDisposableTempDirectory(
		"pretend-act-github-sandbox-",
	);
	await git.init({ defaultBranch: "main", dir: workspace.path, fs: nodeFs });
	await mkdir(path.join(workspace.path, ".github", "workflows"), {
		recursive: true,
	});
	await writeFile(path.join(workspace.path, "README.md"), "checkout\n");
	await writeFile(
		path.join(workspace.path, ".github", "workflows", "release.yml"),
		"name: Release\non: workflow_dispatch\n",
	);
	await git.add({ dir: workspace.path, filepath: "README.md", fs: nodeFs });
	await git.add({
		dir: workspace.path,
		filepath: ".github/workflows/release.yml",
		fs: nodeFs,
	});
	await git.commit({
		author: { email: "pretend-act@example.invalid", name: "Pretend Act" },
		dir: workspace.path,
		fs: nodeFs,
		message: "initial",
	});
	return workspace;
}
