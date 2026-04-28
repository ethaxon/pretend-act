import { inject } from "injection-js";
import { PretendActError } from "../../core/index";
import {
	createNpmRegistryConfig,
	type NpmRegistryConfig,
	type NpmRegistryService,
} from "../../npm-registry/index";
import type { WorkflowStep } from "../../workflows/index";
import type { ActionPretenderConfig } from "../types";
import { NpmRegistryServiceToken } from "./tokens";

export type NpmPublishPretenderOptions = {
	test?: ActionPretenderConfig["test"];
	registry?: NpmRegistryConfig | NpmRegistryService;
	registryUrl?: string;
	token?: string;
	scope?: string;
	alwaysAuth?: boolean;
	conflictBehavior?: "keep" | "error";
};

export function createNpmPublishPretender(
	options: NpmPublishPretenderOptions = {},
): ActionPretenderConfig {
	return {
		test: options.test ?? isNpmPublishStep,
		pretender(step) {
			const command = step.run?.trim();
			if (!command || hasComplexShellSyntax(command)) {
				return { operation: "keep" };
			}
			if (hasNpmRegistryOverride(command)) {
				if ((options.conflictBehavior ?? "keep") === "error") {
					throw new PretendActError(
						"npm publish step already sets --registry or --userconfig; remove that override or provide a custom pretender matcher.",
						{ code: "PRETEND_ACT_NPM_PUBLISH_CONFLICT" },
					);
				}
				return { operation: "keep" };
			}

			const registry = resolveNpmRegistryConfig(options);
			return {
				operation: "replace",
				with: npmPublishReplacementStep(command, registry),
			};
		},
	};
}

export function isNpmPublishStep({ step }: { step: WorkflowStep }): boolean {
	const command = step.run?.trim();
	return (
		command !== undefined && /^(?:npm|pnpm)\s+publish(?:\s|$)/u.test(command)
	);
}

function resolveNpmRegistryConfig(
	options: NpmPublishPretenderOptions,
): NpmRegistryConfig {
	if (options.registry) {
		return options.registry;
	}
	if (options.registryUrl) {
		return createNpmRegistryConfig({
			registryUrl: options.registryUrl,
			token: options.token,
			scope: options.scope,
			alwaysAuth: options.alwaysAuth,
		});
	}
	return inject(NpmRegistryServiceToken);
}

function npmPublishReplacementStep(
	command: string,
	registry: NpmRegistryConfig,
): WorkflowStep {
	return {
		run: [
			"cat > .npmrc <<'PRETEND_ACT_NPMRC'",
			registry.npmrc,
			"PRETEND_ACT_NPMRC",
			command,
		].join("\n"),
		env: registry.env,
	};
}

function hasNpmRegistryOverride(command: string): boolean {
	return /(?:^|\s)--(?:registry|userconfig)(?:=|\s|$)/u.test(command);
}

function hasComplexShellSyntax(command: string): boolean {
	return /[\n;&|]/u.test(command);
}
