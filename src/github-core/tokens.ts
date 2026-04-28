import { InjectionToken } from "injection-js";

import type { GithubActionsWorkspace, GithubCheckoutBackend } from "./types";

export const GithubActionsWorkspaceToken =
	new InjectionToken<GithubActionsWorkspace>("pretend-act.github.workspace");

export const GithubCheckoutBackendToken =
	new InjectionToken<GithubCheckoutBackend>("pretend-act.github.checkout");
