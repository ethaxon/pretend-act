import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PretendActError } from "./errors";
import {
	createDisposableTempDirectory,
	type DisposableTempDirectory,
	safeJoin,
} from "./fs";
import { importOptionalPeer } from "./optional-peer";

export const FileSystemBackendKind = {
	Real: "real",
	Memory: "memory",
	Overlay: "overlay",
} as const;

export type FileSystemBackendKind =
	(typeof FileSystemBackendKind)[keyof typeof FileSystemBackendKind];

export type MaterializedPath = DisposableTempDirectory;

export type FileSystemBackend = Partial<Disposable> &
	Partial<AsyncDisposable> & {
		kind: FileSystemBackendKind;
		rootPath?: string;
		requiresMaterialization: boolean;
		readFile(filePath: string): Promise<Buffer>;
		writeFile(filePath: string, content: string | Buffer): Promise<void>;
		mkdir(directoryPath: string): Promise<void>;
		resolvePath(rootPath: string, ...parts: string[]): Promise<string>;
		materialize?(options?: { prefix?: string }): Promise<MaterializedPath>;
	};

type PlatformaticVfsModule = {
	create(options?: unknown, maybeOptions?: unknown): PlatformaticVfs;
};

type PlatformaticVfs = {
	promises: {
		readFile(filePath: string): Promise<Buffer>;
		writeFile(filePath: string, content: string | Buffer): Promise<void>;
		mkdir(filePath: string, options?: { recursive?: boolean }): Promise<void>;
	};
	unmount?(): void;
};

export function createRealFileSystemBackend(
	rootPath?: string,
): FileSystemBackend {
	return {
		kind: FileSystemBackendKind.Real,
		rootPath,
		requiresMaterialization: false,
		readFile,
		async writeFile(filePath, content) {
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(filePath, content);
		},
		async mkdir(directoryPath) {
			await mkdir(directoryPath, { recursive: true });
		},
		resolvePath: safeJoin,
	};
}

export async function createMemoryFileSystemBackend(): Promise<FileSystemBackend> {
	const platformatic = await importOptionalPeer<PlatformaticVfsModule>(
		"@platformatic/vfs",
		"memory filesystem backend",
	);
	const vfs = platformatic.create(undefined, {
		moduleHooks: false,
		virtualCwd: false,
	});

	return {
		kind: FileSystemBackendKind.Memory,
		requiresMaterialization: true,
		readFile: vfs.promises.readFile,
		async writeFile(filePath, content) {
			await vfs.promises.mkdir(path.dirname(filePath), { recursive: true });
			await vfs.promises.writeFile(filePath, content);
		},
		async mkdir(directoryPath) {
			await vfs.promises.mkdir(directoryPath, { recursive: true });
		},
		async resolvePath(rootPath, ...parts) {
			return path.posix.resolve(rootPath, ...parts);
		},
		async materialize(options = {}) {
			return createDisposableTempDirectory(
				options.prefix ?? "pretend-act-vfs-",
				os.tmpdir(),
			);
		},
		[Symbol.dispose]() {
			vfs.unmount?.();
		},
	};
}

export function assertRealPath(
	filePath: string | undefined,
	purpose: string,
): string {
	if (!filePath || filePath.startsWith("/virtual/")) {
		throw new PretendActError(`${purpose} requires a materialized real path.`, {
			code: "PRETEND_ACT_REQUIRES_REAL_PATH",
		});
	}
	return filePath;
}
