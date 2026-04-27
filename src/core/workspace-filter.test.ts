import nodeFs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { describe, expect, it } from "vitest";

import { copyWorkspace, createDisposableTempDirectory } from "./fs";
import { createWorkspaceFilter } from "./workspace-filter";

describe("workspace filter", () => {
	it("copies workspaces through native glob excludes", async () => {
		const workspace = await createDisposableTempDirectory(
			"pretend-act-glob-source-",
			os.tmpdir(),
		);
		const destination = await createDisposableTempDirectory(
			"pretend-act-glob-copy-",
			os.tmpdir(),
		);
		try {
			const workspacePath = workspace.path;
			const destinationPath = destination.path;
			await mkdir(path.join(workspacePath, ".github", "workflows"), {
				recursive: true,
			});
			await mkdir(path.join(workspacePath, "node_modules", "pkg"), {
				recursive: true,
			});
			await writeFile(path.join(workspacePath, ".gitignore"), "dist/\n");
			await writeFile(
				path.join(workspacePath, ".github", "workflows", "ci.yml"),
				"name: ci\n",
			);
			await writeFile(
				path.join(workspacePath, "node_modules", "pkg", "index.js"),
				"module.exports = {};\n",
			);

			await copyWorkspace({ destinationPath, sourcePath: workspacePath });

			expect(
				await readFile(path.join(destinationPath, ".gitignore"), "utf8"),
			).toBe("dist/\n");
			expect(
				await readFile(
					path.join(destinationPath, ".github", "workflows", "ci.yml"),
					"utf8",
				),
			).toBe("name: ci\n");
			await expect(
				readFile(
					path.join(destinationPath, "node_modules", "pkg", "index.js"),
					"utf8",
				),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await workspace.remove();
			await destination.remove();
		}
	});

	it("combines default ignores, gitignore, and caller ignores", async () => {
		const workspace = await createDisposableTempDirectory(
			"pretend-act-filter-",
			os.tmpdir(),
		);
		try {
			const workspacePath = workspace.path;
			await mkdir(path.join(workspacePath, "docsite", ".vitepress"), {
				recursive: true,
			});
			await git.init({ defaultBranch: "main", dir: workspacePath, fs: nodeFs });
			await writeFile(
				path.join(workspacePath, ".gitignore"),
				"generated/\n",
				"utf8",
			);
			await mkdir(path.join(workspacePath, "generated"), { recursive: true });
			await writeFile(
				path.join(workspacePath, "generated", "file.txt"),
				"gen\n",
			);

			const filter = await createWorkspaceFilter(workspacePath, {
				useGitIgnore: true,
				ignore: ["docsite/.vitepress/cache"],
			});

			expect(filter.shouldCopy("src/index.ts")).toBe(true);
			expect(filter.shouldCopy("node_modules/pkg/index.js")).toBe(false);
			expect(filter.shouldCopy("generated/file.txt")).toBe(false);
			expect(filter.shouldCopy("docsite/.vitepress/cache/data.json")).toBe(
				false,
			);
		} finally {
			await workspace.remove();
		}
	});

	it("uses git listFiles as the copy source when gitignore filtering is enabled", async () => {
		const workspace = await createDisposableTempDirectory(
			"pretend-act-filter-repo-",
			os.tmpdir(),
		);
		const destination = await createDisposableTempDirectory(
			"pretend-act-filter-copy-",
			os.tmpdir(),
		);
		try {
			const workspacePath = workspace.path;
			const destinationPath = destination.path;
			await git.init({ defaultBranch: "main", dir: workspacePath, fs: nodeFs });
			await mkdir(path.join(workspacePath, "generated"), { recursive: true });
			await writeFile(path.join(workspacePath, ".gitignore"), "generated/\n");
			await writeFile(path.join(workspacePath, "tracked.txt"), "tracked\n");
			await writeFile(
				path.join(workspacePath, "generated", "tracked.txt"),
				"tracked generated\n",
			);
			await writeFile(
				path.join(workspacePath, "generated", "ignored.txt"),
				"ignored\n",
			);
			await writeFile(path.join(workspacePath, "untracked.txt"), "untracked\n");
			await git.add({ dir: workspacePath, filepath: ".gitignore", fs: nodeFs });
			await git.add({
				dir: workspacePath,
				filepath: "tracked.txt",
				fs: nodeFs,
			});
			await git.add({
				dir: workspacePath,
				filepath: "generated/tracked.txt",
				force: true,
				fs: nodeFs,
			});

			await copyWorkspace({
				destinationPath,
				filter: { useGitIgnore: true },
				sourcePath: workspacePath,
			});

			expect(
				await readFile(path.join(destinationPath, "tracked.txt"), "utf8"),
			).toBe("tracked\n");
			expect(
				await readFile(
					path.join(destinationPath, "generated", "tracked.txt"),
					"utf8",
				),
			).toBe("tracked generated\n");
			await expect(
				readFile(
					path.join(destinationPath, "generated", "ignored.txt"),
					"utf8",
				),
			).rejects.toMatchObject({ code: "ENOENT" });
			await expect(
				readFile(path.join(destinationPath, "untracked.txt"), "utf8"),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await workspace.remove();
			await destination.remove();
		}
	});
});
