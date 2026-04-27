function stripMonorepoTscExports(exportsField) {
	if (!exportsField || typeof exportsField !== "object") {
		return false;
	}

	let changed = false;
	if (Object.hasOwn(exportsField, "dev")) {
		delete exportsField.dev;
		changed = true;
	}

	for (const nestedValue of Object.values(exportsField)) {
		if (stripMonorepoTscExports(nestedValue)) {
			changed = true;
		}
	}

	return changed;
}

module.exports = {
	hooks: {
		beforePacking(pkg) {
			stripMonorepoTscExports(pkg.exports);
			return pkg;
		},
	},
};
