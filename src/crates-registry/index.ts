export type CargoRegistryConfigOptions = {
	name: string;
	indexUrl: string;
	token?: string;
};

export type CargoRegistryConfig = {
	name: string;
	configToml: string;
	env: Record<string, string>;
};

export function createCargoRegistryConfig(
	options: CargoRegistryConfigOptions,
): CargoRegistryConfig {
	const tokenEnvName = `CARGO_REGISTRIES_${options.name.toUpperCase().replaceAll("-", "_")}_TOKEN`;
	return {
		name: options.name,
		configToml: `[registries.${options.name}]\nindex = "${options.indexUrl}"\n`,
		env: options.token ? { [tokenEnvName]: options.token } : {},
	};
}

export * from "./server";
