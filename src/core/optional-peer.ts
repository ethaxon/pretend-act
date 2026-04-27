import { PretendActOptionalPeerError } from "./errors";

export async function importOptionalPeer<T>(
	packageName: string,
	importer: string,
): Promise<T> {
	try {
		return (await import(packageName)) as T;
	} catch (error) {
		throw new PretendActOptionalPeerError(packageName, importer, error);
	}
}
