import { inject } from "injection-js";
import { PretendActError } from "../../core/index";
import type { DockerRegistryService } from "../../docker-registry/index";
import type { WorkflowStep } from "../../workflows/index";
import type { ActionPretenderConfig, ActionPretenderContext } from "../types";
import { DockerRegistryServiceToken } from "./tokens";

export type DockerRegistryTarget = Pick<
	DockerRegistryService,
	"imagePrefix" | "registryUrl"
>;

export type DockerPublishRewriteInput = {
	step: WorkflowStep;
	context: ActionPretenderContext;
	registry: DockerRegistryTarget;
	sourceImage: string;
};

export type DockerPublishPretenderOptions = {
	test?: ActionPretenderConfig["test"];
	registry?: DockerRegistryTarget;
	sourceImage?: string;
	targetImage?: string;
	rewriteTag?: (input: DockerPublishRewriteInput) => string;
};

export function createDockerPublishPretender(
	options: DockerPublishPretenderOptions = {},
): ActionPretenderConfig {
	return {
		test: options.test ?? (() => false),
		pretender(step, context) {
			const registry = options.registry ?? inject(DockerRegistryServiceToken);
			const sourceImage =
				options.sourceImage ?? parseDockerPushImage(step.run?.trim());
			if (!sourceImage) {
				throw new PretendActError(
					"Docker publish pretender requires sourceImage, or a matched 'docker push <image>' run step.",
					{ code: "PRETEND_ACT_DOCKER_PUBLISH_SOURCE_REQUIRED" },
				);
			}
			const targetImage =
				options.targetImage ??
				options.rewriteTag?.({ step, context, registry, sourceImage }) ??
				localDockerImage(registry.imagePrefix, sourceImage);
			return {
				operation: "replace",
				with: {
					run: `docker tag ${sourceImage} ${targetImage}\ndocker push ${targetImage}`,
					env: { PRETEND_ACT_DOCKER_REGISTRY: registry.registryUrl },
				},
			};
		},
	};
}

function parseDockerPushImage(command: string | undefined): string | undefined {
	if (!command || /[\n;&|]/u.test(command)) {
		return undefined;
	}
	const match = /^docker\s+push\s+([^\s]+)$/u.exec(command);
	return match?.[1];
}

function localDockerImage(imagePrefix: string, sourceImage: string): string {
	return `${imagePrefix}/${stripRegistryPrefix(sourceImage)}`;
}

function stripRegistryPrefix(image: string): string {
	const [firstSegment, ...rest] = image.split("/");
	if (
		rest.length > 0 &&
		(firstSegment.includes(".") ||
			firstSegment.includes(":") ||
			firstSegment === "localhost")
	) {
		return rest.join("/");
	}
	return image;
}
