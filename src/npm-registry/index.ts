export type NpmRegistryConfigOptions = {
	registryUrl: string;
	token?: string;
	scope?: string;
	alwaysAuth?: boolean;
};

export type NpmRegistryConfig = {
	registryUrl: string;
	npmrc: string;
	env: Record<string, string>;
};

export function createNpmRegistryConfig(
	options: NpmRegistryConfigOptions,
): NpmRegistryConfig {
	const registryLine = options.scope
		? `${options.scope}:registry=${options.registryUrl}`
		: `registry=${options.registryUrl}`;
	const registryHost = options.registryUrl.replace(/^https?:/, "");
	const authLines = options.token
		? [`${registryHost}:_authToken=${options.token}`]
		: [];
	const alwaysAuthLine = options.alwaysAuth ? ["always-auth=true"] : [];

	return {
		registryUrl: options.registryUrl,
		npmrc: [registryLine, ...authLines, ...alwaysAuthLine].join("\n"),
		env: options.token ? { NPM_TOKEN: options.token } : {},
	};
}

export * from "./server";
