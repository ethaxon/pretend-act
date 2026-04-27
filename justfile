set dotenv-load

lint:
	mise exec --command "pnpm lint"

lint-fix:
	mise exec --command "pnpm lint-fix"

typecheck:
	mise exec --command "pnpm typecheck"

test:
	mise exec --command "pnpm test"

build:
	mise exec --command "pnpm build"

verify: lint typecheck test build
