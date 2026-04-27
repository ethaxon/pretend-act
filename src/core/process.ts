import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { CommandSpec, Dict, RunLogEvent } from "./types";

export type SpawnCommandOptions = {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Dict<string>;
	logFile?: string;
	onLog?: (event: RunLogEvent) => void;
};

export type SpawnCommandResult = {
	command: CommandSpec;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	rawLog: string;
};

export async function spawnCommand(
	options: SpawnCommandOptions,
): Promise<SpawnCommandResult> {
	const args = options.args ?? [];
	let stdout = "";
	let stderr = "";
	let rawLog = "";
	const logStream = options.logFile
		? await openLogStream(options.logFile)
		: undefined;

	return new Promise((resolve, reject) => {
		const child = spawn(options.command, args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdio: ["ignore", "pipe", "pipe"],
		});

		child.stdout.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stdout += text;
			rawLog += text;
			logStream?.write(text);
			options.onLog?.({ stream: "stdout", chunk: text });
		});

		child.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderr += text;
			rawLog += text;
			logStream?.write(text);
			options.onLog?.({ stream: "stderr", chunk: text });
		});

		child.on("error", (error) => {
			logStream?.close();
			reject(error);
		});

		child.on("close", (exitCode) => {
			logStream?.close();
			resolve({
				command: {
					command: options.command,
					args,
					cwd: options.cwd,
					env: options.env,
				},
				exitCode,
				stdout,
				stderr,
				rawLog,
			});
		});
	});
}

async function openLogStream(logFile: string) {
	await mkdir(path.dirname(logFile), { recursive: true });
	return createWriteStream(logFile, { flags: "a" });
}
