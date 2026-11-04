# bruhs

The bruhs monorepo contains the shared design system, apps and backend.

- [`apps/outside`](apps/outside/README.md): Outside, the Expo iPhone and Android step game.
- [`apps/outside-site`](apps/outside-site/README.md): Outside's landing page and waitlist at `outside.bruhs.app`.
- [`apps/api`](apps/api/README.md): `bruhs-api`, the shared Convex backend. Outside's private weekly races are its first domain.
- `packages/ui`: shared brand components, styles and tokens.

Run these commands from the repository root. Keep `dev:api` running in one terminal. Follow [the API setup](apps/api/README.md) for signing keys and app configuration, then run `check:api` and `dev:outside` in another terminal:

```sh
pnpm install
CONVEX_AGENT_MODE=anonymous pnpm dev:api  # Start the local backend
pnpm check:api                          # Lint, types and in-memory API tests
pnpm dev:outside                          # Start Outside
```

Follow [the API setup](apps/api/README.md) to connect an app. Starting the backend does not change app environment files. Each app's README describes its checks and build requirements.
