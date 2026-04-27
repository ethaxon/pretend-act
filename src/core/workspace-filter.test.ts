import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDirectory } from "./fs";
import { createWorkspaceFilter } from "./workspace-filter";

describe("workspace filter", () => {
	it("combines default ignores, gitignore, and caller ignores", async () => {
		const workspacePath = await createTempDirectory(
			"pretend-act-filter-",
			os.tmpdir(),
		);
		await mkdir(path.join(workspacePath, "docsite", ".vitepress"), {
			recursive: true,
		});
		await writeFile(
			path.join(workspacePath, ".gitignore"),
			"generated/\n",
			"utf8",
		);

		const filter = await createWorkspaceFilter(workspacePath, {
			useGitIgnore: true,
			ignore: ["docsite/.vitepress/cache"],
		});

		expect(filter.shouldCopy("src/index.ts")).toBe(true);
		expect(filter.shouldCopy("node_modules/pkg/index.js")).toBe(false);
		expect(filter.shouldCopy("generated/file.txt")).toBe(false);
		expect(filter.shouldCopy("docsite/.vitepress/cache/data.json")).toBe(false);
	});
});
