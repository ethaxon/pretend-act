import { inject } from "injection-js";

import {
	type CheckoutReplacementStepOptions,
	createCheckoutReplacementStep,
} from "../../git-registry/index";
import { GithubCheckoutBackendToken } from "../../github-core/tokens";
import type { ActionPretenderConfig } from "../types";

export type CheckoutPretenderOptions = CheckoutReplacementStepOptions & {
	test?: ActionPretenderConfig["test"];
};

export function createCheckoutPretender(
	options: CheckoutPretenderOptions = {},
): ActionPretenderConfig {
	const { test, ...defaultOptions } = options;
	return {
		test: test ?? "actions/checkout",
		pretender(step) {
			const checkout = inject(GithubCheckoutBackendToken);
			const stepOptions = {
				...defaultOptions,
				...checkoutOptionsFromStep(step.with),
			};
			return {
				operation: "replace",
				with: createCheckoutReplacementStep(checkout, stepOptions),
			};
		},
	};
}

function checkoutOptionsFromStep(
	withOptions: Record<string, unknown> | undefined,
): CheckoutReplacementStepOptions {
	return {
		path: stringOption(withOptions?.path),
		clean: booleanOption(withOptions?.clean),
	};
}

function stringOption(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function booleanOption(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		return value.toLowerCase() === "true"
			? true
			: value.toLowerCase() === "false"
				? false
				: undefined;
	}
	return undefined;
}
