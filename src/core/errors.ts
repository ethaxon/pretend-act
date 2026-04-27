export class PretendActError extends Error {
	readonly code: string;
	override readonly cause?: unknown;

	constructor(
		message: string,
		options: { code?: string; cause?: unknown } = {},
	) {
		super(message);
		this.name = "PretendActError";
		this.code = options.code ?? "PRETEND_ACT_ERROR";
		this.cause = options.cause;
	}
}

export class PretendActOptionalPeerError extends PretendActError {
	readonly packageName: string;
	readonly installHint: string;

	constructor(packageName: string, importer: string, cause?: unknown) {
		const installHint = `Install optional peer '${packageName}' to use ${importer}.`;
		super(installHint, {
			code: "PRETEND_ACT_OPTIONAL_PEER_MISSING",
			cause,
		});
		this.name = "PretendActOptionalPeerError";
		this.packageName = packageName;
		this.installHint = installHint;
	}
}

export class PretendActCommandError extends PretendActError {
	readonly exitCode: number | null;

	constructor(
		message: string,
		options: { exitCode: number | null; cause?: unknown },
	) {
		super(message, {
			code: "PRETEND_ACT_COMMAND_FAILED",
			cause: options.cause,
		});
		this.name = "PretendActCommandError";
		this.exitCode = options.exitCode;
	}
}
