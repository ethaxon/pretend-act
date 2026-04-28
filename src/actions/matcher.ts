import type {
	ActionPretenderMatchExpression,
	ActionPretenderMatcher,
	ActionPretenderMatchInput,
} from "./types";

export function matchesActionPretender(
	matcher: ActionPretenderMatcher,
	input: ActionPretenderMatchInput,
): boolean {
	if (isMatcherArray(matcher)) {
		return matcher.some((item) =>
			matchesActionPretenderExpression(item, input),
		);
	}
	return matchesActionPretenderExpression(matcher, input);
}

export function getActionIdFromUses(
	uses: string | undefined,
): string | undefined {
	if (!uses || uses.startsWith("./") || uses.startsWith("../")) {
		return undefined;
	}
	return uses.split("@")[0]?.toLowerCase();
}

function matchesActionPretenderExpression(
	matcher: ActionPretenderMatchExpression,
	input: ActionPretenderMatchInput,
): boolean {
	if (typeof matcher === "function") {
		return matcher(input);
	}
	if (typeof matcher === "string") {
		return matchesStringMatcher(matcher, input);
	}
	matcher.lastIndex = 0;
	return matcher.test(
		input.originalUses ?? input.step.run ?? input.actionId ?? "",
	);
}

function isMatcherArray(
	matcher: ActionPretenderMatcher,
): matcher is readonly ActionPretenderMatchExpression[] {
	return Array.isArray(matcher);
}

function matchesStringMatcher(
	matcher: string,
	input: ActionPretenderMatchInput,
): boolean {
	const normalizedMatcher = matcher.toLowerCase();
	if (normalizedMatcher.includes("@")) {
		return input.originalUses?.toLowerCase() === normalizedMatcher;
	}
	return input.actionId === normalizedMatcher;
}
