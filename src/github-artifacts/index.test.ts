import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createArtifactStore } from "./index";

describe("artifact store", () => {
	it("blocks path traversal", async () => {
		const store = createArtifactStore(
			await mkdtemp(path.join(os.tmpdir(), "pretend-act-artifacts-")),
		);
		await expect(store.writeArtifact("../escape.txt", "nope")).rejects.toThrow(
			"Path escapes root",
		);
	});
});
