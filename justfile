set dotenv-load := true
set windows-shell := ["pwsh.exe", "-NoLogo", "-ExecutionPolicy", "RemoteSigned", "-Command"]

setup:
	mise install
	pnpm install

lint:
	pnpm lint

fix:
	pnpm lint-fix

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

verify: lint typecheck test build
