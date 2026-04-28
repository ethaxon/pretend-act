import { describe, expect, it } from "vitest";

import { createRemoteMockContainer } from "./remote-mock";

describe("remote mock container", () => {
	it("creates a no-service container with safe fake secrets", async () => {
		await using container = await createRemoteMockContainer();
		expect(container.mode).toBe("remote-mock");
		expect(container.secrets.GITHUB_TOKEN).toBe("pretend-act-github-token");
	});
});
