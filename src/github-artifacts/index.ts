import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeJoin } from "../core/index";

export type ArtifactStore = {
	rootPath: string;
	writeArtifact(name: string, content: string | Buffer): Promise<string>;
	readArtifact(name: string): Promise<Buffer>;
	readJsonArtifact<T>(name: string): Promise<T>;
};

export function createArtifactStore(rootPath: string): ArtifactStore {
	return {
		rootPath,
		async writeArtifact(name, content) {
			const artifactPath = await safeJoin(rootPath, name);
			await mkdir(path.dirname(artifactPath), { recursive: true });
			await writeFile(artifactPath, content);
			return artifactPath;
		},
		async readArtifact(name) {
			return readFile(await safeJoin(rootPath, name));
		},
		async readJsonArtifact<T>(name: string) {
			return JSON.parse((await this.readArtifact(name)).toString("utf8")) as T;
		},
	};
}

export async function readJsonReport<T>(reportPath: string): Promise<T> {
	return JSON.parse(await readFile(reportPath, "utf8")) as T;
}
