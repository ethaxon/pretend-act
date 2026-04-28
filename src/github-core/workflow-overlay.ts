import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Injector } from "injection-js";
import { parse, stringify } from "yaml";

import { compileActionPretendersToWorkflowOverlay } from "../actions/compile";
import type { ActionPretenderRegistry } from "../actions/types";
import { createDisposableTempDirectory } from "../core/index";
import type { EngineCapabilities, PretendEngineType } from "../engine/types";
import {
	applyWorkflowOverlayToModel,
	type GithubWorkflow,
	type WorkflowOverlay,
} from "../workflows/index";

export type ApplyWorkflowOverlayOptions = {
	cwd: string;
	workflowFile: string;
	workflowOverlay?: WorkflowOverlay;
	actions?: ActionPretenderRegistry;
	actionConfig?: unknown;
	engine?: PretendEngineType;
	capabilities?: EngineCapabilities;
	injector?: Injector;
};

export type PreparedWorkflowOverlay = AsyncDisposable & {
	cwd: string;
	workflowFile: string;
	sourceWorkflowFile: string;
	stagedWorkflowFile?: string;
	staged: boolean;
};

export async function applyWorkflowOverlay(
	options: ApplyWorkflowOverlayOptions,
): Promise<void> {
	const workflowPath = resolveWorkflowPath(options.cwd, options.workflowFile);
	const workflow = await readWorkflow(workflowPath);
	const overlay = await buildWorkflowOverlay(options, workflow);

	if (overlay.length > 0) {
		applyWorkflowOverlayToModel(workflow, overlay);
	}

	await writeFile(workflowPath, stringify(workflow), "utf8");
}

export async function prepareWorkflowOverlay(
	options: ApplyWorkflowOverlayOptions,
): Promise<PreparedWorkflowOverlay> {
	const sourceWorkflowFile = resolveWorkflowPath(
		options.cwd,
		options.workflowFile,
	);
	if (!hasWorkflowTransforms(options)) {
		return createOriginalPreparedWorkflow(options.cwd, options.workflowFile);
	}

	const workflow = await readWorkflow(sourceWorkflowFile);
	const overlay = await buildWorkflowOverlay(options, workflow);
	if (overlay.length === 0) {
		return createOriginalPreparedWorkflow(options.cwd, options.workflowFile);
	}

	applyWorkflowOverlayToModel(workflow, overlay);
	const tempDirectory = await createDisposableTempDirectory(
		".pretend-act-workflow-",
		options.cwd,
	);
	const stagedRelativeWorkflowFile = stagedWorkflowRelativePath(
		options.workflowFile,
	);
	const stagedWorkflowFile = path.join(
		tempDirectory.path,
		stagedRelativeWorkflowFile,
	);
	await mkdir(path.dirname(stagedWorkflowFile), { recursive: true });
	await writeFile(stagedWorkflowFile, stringify(workflow), "utf8");

	return {
		cwd: options.cwd,
		workflowFile: path.relative(options.cwd, stagedWorkflowFile),
		sourceWorkflowFile,
		stagedWorkflowFile,
		staged: true,
		async [Symbol.asyncDispose]() {
			await tempDirectory[Symbol.asyncDispose]();
		},
	};
}

async function readWorkflow(workflowPath: string): Promise<GithubWorkflow> {
	return parse(await readFile(workflowPath, "utf8")) as GithubWorkflow;
}

async function buildWorkflowOverlay(
	options: ApplyWorkflowOverlayOptions,
	workflow: GithubWorkflow,
): Promise<WorkflowOverlay> {
	return [
		...(options.workflowOverlay ?? []),
		...(await compileActionPretendersToWorkflowOverlay({
			workflow,
			actions: options.actions,
			config: options.actionConfig,
			engine: options.engine,
			capabilities: options.capabilities,
			injector: options.injector,
		})),
	];
}

function hasWorkflowTransforms(options: ApplyWorkflowOverlayOptions): boolean {
	return (
		(options.workflowOverlay?.length ?? 0) > 0 ||
		Object.keys(options.actions ?? {}).length > 0
	);
}

function createOriginalPreparedWorkflow(
	cwd: string,
	workflowFile: string,
): PreparedWorkflowOverlay {
	return {
		cwd,
		workflowFile,
		sourceWorkflowFile: resolveWorkflowPath(cwd, workflowFile),
		staged: false,
		async [Symbol.asyncDispose]() {},
	};
}

function stagedWorkflowRelativePath(workflowFile: string): string {
	if (path.isAbsolute(workflowFile)) {
		return path.join(".github", "workflows", path.basename(workflowFile));
	}
	return workflowFile;
}

function resolveWorkflowPath(cwd: string, workflowFile: string): string {
	if (path.isAbsolute(workflowFile)) {
		return workflowFile;
	}
	return path.resolve(cwd, workflowFile);
}
