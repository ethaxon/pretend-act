import { PretendActError, type RunResult } from "../core/index";
import {
	type EngineAdapter,
	type EngineCapabilities,
	type EngineRunRequest,
	FullEngineCapabilities,
} from "../engine/index";
import { prepareWorkflowOverlay } from "../github-core/workflow-overlay";
import type { PretendRunnerOptions, WorkflowRunOptions } from "./types";

export class PretendRunner {
	private readonly options: PretendRunnerOptions;

	constructor(options: PretendRunnerOptions) {
		this.options = options;
	}

	async validateWorkflow(options: WorkflowRunOptions = {}): Promise<RunResult> {
		return this.run({ ...options, event: undefined, validate: true });
	}

	async runWorkflow(options: WorkflowRunOptions = {}): Promise<RunResult> {
		return this.run(options);
	}

	async dryRunWorkflow(
		event: string,
		options: WorkflowRunOptions = {},
	): Promise<RunResult> {
		return this.run({ ...options, event, dryRun: true });
	}

	async runEvent(
		event: string,
		options: WorkflowRunOptions = {},
	): Promise<RunResult> {
		return this.run({ ...options, event });
	}

	async runJob(
		jobId: string,
		options: WorkflowRunOptions = {},
	): Promise<RunResult> {
		return this.run({ ...options, job: jobId });
	}

	private async run(options: WorkflowRunOptions): Promise<RunResult> {
		const cwd = options.cwd ?? this.options.cwd;
		const workflowFile =
			options.workflowFile ?? this.options.workflowFile ?? ".github/workflows";
		const workflowOverlay = [
			...(this.options.workflowOverlay ?? []),
			...(options.workflowOverlay ?? []),
		];
		const actions = {
			...(this.options.actions ?? {}),
			...(options.actions ?? {}),
		};

		const runRequest: EngineRunRequest = {
			...(this.options.engineOptions ?? {}),
			...(options.engineOptions ?? {}),
			cwd,
			workflowFile,
			event: options.event,
			validate: options.validate,
			dryRun: options.dryRun,
			job: options.job,
			logFile: options.logFile,
			eventPath: options.eventPath,
			eventPayload: options.eventPayload,
			inputs: options.inputs,
			env: options.env,
			secrets: options.secrets,
			vars: options.vars,
			platforms: options.platforms,
			matrix: options.matrix,
			artifactServer: options.artifactServer,
			passthroughArgs: options.passthroughArgs,
			onLog: options.onLog,
		};
		assertEngineSupportsRequest(this.options.engine, runRequest);

		await using preparedWorkflow = await prepareWorkflowOverlay({
			cwd,
			workflowFile,
			workflowOverlay,
			actions,
			actionConfig: options.actionConfig ?? this.options.actionConfig,
			engine: this.options.engine.type,
			capabilities: this.options.engine.capabilities ?? FullEngineCapabilities,
			injector: options.injector ?? this.options.injector,
		});

		return this.options.engine.run({
			...runRequest,
			cwd: preparedWorkflow.cwd,
			workflowFile: preparedWorkflow.workflowFile,
		});
	}
}

function assertEngineSupportsRequest(
	engine: EngineAdapter,
	request: EngineRunRequest,
): void {
	const capabilities = engine.capabilities ?? FullEngineCapabilities;
	const unsupported = unsupportedRequestFields(capabilities, request);
	if (unsupported.length === 0) {
		return;
	}
	throw new PretendActError(
		`${engine.type} engine does not support: ${unsupported.join(", ")}.`,
		{ code: "PRETEND_ACT_UNSUPPORTED_ENGINE_OPTION" },
	);
}

function unsupportedRequestFields(
	capabilities: EngineCapabilities,
	request: EngineRunRequest,
): string[] {
	const unsupported: string[] = [];
	if (request.event && !capabilities.event) unsupported.push("event");
	if (request.validate && !capabilities.validate) unsupported.push("validate");
	if (request.dryRun && !capabilities.dryRun) unsupported.push("dryRun");
	if (request.job && !capabilities.job) unsupported.push("job");
	if (request.eventPath && !capabilities.eventPath)
		unsupported.push("eventPath");
	if (request.eventPayload !== undefined && !capabilities.eventPayload) {
		unsupported.push("eventPayload");
	}
	if (request.inputs && !capabilities.inputs) unsupported.push("inputs");
	if (request.env && !capabilities.env) unsupported.push("env");
	if (request.secrets && !capabilities.secrets) unsupported.push("secrets");
	if (request.vars && !capabilities.vars) unsupported.push("vars");
	if (request.platforms && !capabilities.platforms)
		unsupported.push("platforms");
	if (request.matrix && !capabilities.matrix) unsupported.push("matrix");
	if (request.artifactServer && !capabilities.artifactServer) {
		unsupported.push("artifactServer");
	}
	return unsupported;
}

export type { PretendRunnerOptions, WorkflowRunOptions } from "./types";
