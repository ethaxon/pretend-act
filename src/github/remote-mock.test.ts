import { describe, expect, it } from "vitest";

import { createRemoteMockEnvironment } from "./remote-mock";

describe("remote mock environment", () => {
	it("creates a no-service environment with safe fake secrets", async () => {
		const environment = await createRemoteMockEnvironment();
		try {
			expect(environment.mode).toBe("remote-mock");
			expect(environment.secrets.GITHUB_TOKEN).toBe("pretend-act-github-token");
		} finally {
			await environment.stop();
		}
	});
});
