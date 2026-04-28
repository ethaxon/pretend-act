import { describe, expect, it } from "vitest";

import { getActionIdFromUses, matchesActionPretender } from "./index";
import type { ActionPretenderMatchInput } from "./types";

describe("action matcher", () => {
	it("matches normalized action ids and full uses refs", () => {
		const input = createInput("actions/checkout@v6");

		expect(matchesActionPretender("actions/checkout", input)).toBe(true);
		expect(matchesActionPretender("actions/checkout@v6", input)).toBe(true);
		expect(matchesActionPretender("actions/setup-node", input)).toBe(false);
	});

	it("supports regex, function, and array matchers", () => {
		const input = createInput("actions/upload-artifact@v7");

		expect(matchesActionPretender(/^actions\/upload-artifact@/, input)).toBe(
			true,
		);
		expect(
			matchesActionPretender((value) => value.jobId === "release", input),
		).toBe(true);
		expect(
			matchesActionPretender(
				["actions/cache", "actions/upload-artifact"],
				input,
			),
		).toBe(true);
	});

	it("normalizes remote action ids but leaves local actions unmatched", () => {
		expect(getActionIdFromUses("OWNER/Action@main")).toBe("owner/action");
		expect(getActionIdFromUses("./.github/actions/build")).toBeUndefined();
	});
});

function createInput(uses: string): ActionPretenderMatchInput {
	const step = { uses };
	const job = { steps: [step] };
	return {
		workflow: { jobs: { release: job } },
		jobId: "release",
		job,
		step,
		stepIndex: 0,
		actionId: getActionIdFromUses(uses),
		originalUses: uses,
	};
}
