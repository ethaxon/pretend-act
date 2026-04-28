import type { ActionPretenderRegistry } from "../actions/types";
import type { ActEngineOptions, AgentCiEngineOptions } from "../engine/index";
import { PretendEngineType as EngineType } from "../engine/index";
import type { GithubActionsContainerOptions } from "../github-core/index";
import type { WorkflowRunOptions } from "../runner/index";

export const PretendEngineType = EngineType;

export type PretendEngineType =
	(typeof PretendEngineType)[keyof typeof PretendEngineType];

export type PretendActConfig = {
	engine?: PretendEngineConfig;
	actions?: ActionPretenderRegistry;
	runner?: PretendRunnerConfig;
};

export type PretendEngineConfig = ActEngineConfig | AgentCiEngineConfig;

export type ActEngineConfig = {
	type: typeof PretendEngineType.Act;
	options?: ActEngineOptions;
};

export type AgentCiEngineConfig = {
	type: typeof PretendEngineType.AgentCi;
	options?: AgentCiEngineOptions;
};

export type PretendRunnerConfig = {
	github?: GithubActionsContainerOptions;
	workflow?: WorkflowRunOptions;
};

export type {
	ActionPretender,
	ActionPretenderConfig,
	ActionPretenderContext,
	ActionPretenderMatcher,
	ActionPretenderRegistry,
} from "../actions/index";

export function defineConfig<const Config extends PretendActConfig>(
	config: Config,
): Config {
	return config;
}
