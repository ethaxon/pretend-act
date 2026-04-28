import type { InjectionToken, Injector, Provider, Type } from "injection-js";

import type { FileSystemBackend, WorkspaceFilterOptions } from "../core/index";
import type {
	GitHttpTransportCreateOptions,
	GitRegistry,
	GitRegistryTransport,
} from "../git-registry/index";
import type {
	GithubWorkflow,
	WorkflowJob,
	WorkflowOverlay,
	WorkflowStep,
	WorkflowStepSelector,
} from "../workflows/index";

export type {
	GithubWorkflow,
	WorkflowJob,
	WorkflowOverlay,
	WorkflowStep,
	WorkflowStepSelector,
};

export const GithubRepositorySourceType = {
	Local: "local",
} as const;

export type GithubRepositorySourceType =
	(typeof GithubRepositorySourceType)[keyof typeof GithubRepositorySourceType];

export type StepSelector = WorkflowStepSelector;

export type PretendInjectionToken<T> = InjectionToken<T> | Type<T>;

export type GithubActionsContainerOptions = {
	repository: GithubRepositoryOptions;
	providers?: Provider[];
	parentInjector?: Injector;
};

export type GithubRepositoryOptions = {
	owner?: string;
	name: string;
	defaultBranch?: string;
	ref?: string;
	sha?: string;
	source: GithubRepositorySource;
	checkout?: false | GithubCheckoutOptions;
	sandbox?: GithubRepositorySandboxOptions;
};

export type GithubRepositorySource = GithubLocalRepositorySource;

export type GithubLocalRepositorySource = {
	type?: typeof GithubRepositorySourceType.Local;
	path: string;
	ignore?: string[];
	workspaceFilter?: WorkspaceFilterOptions;
	files?: { src: string; dest?: string }[];
};

export type GithubRepositorySandboxOptions = {
	setupPath?: string;
	tempRootPath?: string;
	fsBackend?: "real" | "memory" | "overlay" | FileSystemBackend;
	materialize?: "always" | "before-child-process" | "never";
	keepOnFailure?: boolean;
	initializeGit?: boolean;
};

export type GithubCheckoutOptions = {
	transport?: GitRegistryTransport;
	http?: GitHttpTransportCreateOptions;
	remoteUrl?: string;
	sourceRef?: string;
	sourceSha?: string;
	snapshotBranch?: string;
	snapshotMessage?: string;
	workspaceFilter?: WorkspaceFilterOptions;
	forceSnapshot?: boolean;
};

export type GithubCheckoutBackend = GitRegistry;

export type GithubActionsWorkspace = {
	rootPath: string;
	repoPath: string;
	repoName: string;
	owner: string;
	keepOnFailure: boolean;
	materialized: boolean;
	backend?: FileSystemBackend;
	getPath(repositoryName?: string): string | undefined;
	materialize(): Promise<string>;
};

export type GithubActionsContainer = AsyncDisposable & {
	workspace: GithubActionsWorkspace;
	checkout?: GithubCheckoutBackend;
	injector: Injector;
	get<T>(token: PretendInjectionToken<T>): T | undefined;
	require<T>(token: PretendInjectionToken<T>): T;
	cleanup(options?: { failed?: boolean }): Promise<void>;
};
