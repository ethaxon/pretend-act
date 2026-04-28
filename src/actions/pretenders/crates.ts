import { inject } from "injection-js";
import { PretendActError } from "../../core/index";
import {
	type CargoRegistryConfig,
	type CratesRegistryService,
	createCargoRegistryConfig,
} from "../../crates-registry/index";
import type { WorkflowStep } from "../../workflows/index";
import type { ActionPretenderConfig } from "../types";
import { CratesRegistryServiceToken } from "./tokens";

export type CargoPublishPretenderOptions = {
	test?: ActionPretenderConfig["test"];
	registry?: CargoRegistryConfig | CratesRegistryService;
	name?: string;
	indexUrl?: string;
	token?: string;
	conflictBehavior?: "keep" | "error";
};

export function createCargoPublishPretender(
	options: CargoPublishPretenderOptions = {},
): ActionPretenderConfig {
	return {
		test: options.test ?? isCargoPublishStep,
		pretender(step) {
			const command = step.run?.trim();
			if (!command || hasComplexShellSyntax(command)) {
				return { operation: "keep" };
			}
			if (hasCargoRegistryOverride(command)) {
				if ((options.conflictBehavior ?? "keep") === "error") {
					throw new PretendActError(
						"cargo publish step already sets --registry or --index; remove that override or provide a custom pretender matcher.",
						{ code: "PRETEND_ACT_CARGO_PUBLISH_CONFLICT" },
					);
				}
				return { operation: "keep" };
			}

			const registry = resolveCargoRegistryConfig(options);
			return {
				operation: "replace",
				with: cargoPublishReplacementStep(command, registry),
			};
		},
	};
}

export function isCargoPublishStep({ step }: { step: WorkflowStep }): boolean {
	const command = step.run?.trim();
	return command !== undefined && /^cargo\s+publish(?:\s|$)/u.test(command);
}

function resolveCargoRegistryConfig(
	options: CargoPublishPretenderOptions,
): CargoRegistryConfig {
	if (options.registry) {
		return options.registry;
	}
	if (options.indexUrl) {
		return createCargoRegistryConfig({
			name: options.name ?? "pretend-act",
			indexUrl: options.indexUrl,
			token: options.token,
		});
	}
	return inject(CratesRegistryServiceToken);
}

function cargoPublishReplacementStep(
	command: string,
	registry: CargoRegistryConfig,
): WorkflowStep {
	return {
		run: [
			"mkdir -p .cargo",
			"cat > .cargo/config.toml <<'PRETEND_ACT_CARGO_CONFIG'",
			registry.configToml,
			"PRETEND_ACT_CARGO_CONFIG",
			`${command} --registry ${registry.name}`,
		].join("\n"),
		env: registry.env,
	};
}

function hasCargoRegistryOverride(command: string): boolean {
	return /(?:^|\s)--(?:registry|index)(?:=|\s|$)/u.test(command);
}

function hasComplexShellSyntax(command: string): boolean {
	return /[\n;&|]/u.test(command);
}
