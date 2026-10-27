# CampusHub Frontend Guidelines

- Use functional React components only.
- Declare explicit TypeScript interfaces for component props.
- Manage component state with React `useState` and `useEffect` or custom hooks.
- Keep API calls out of JSX. Use the typed client in `client/src/api/`.
- Use CSS Modules for component styling and keep styles modular and consistent. Reserve global CSS for base styles.
- Do not use the TypeScript `any` type.
- Respect the backend contract in `docs/openapi.yaml` and the implemented `/api/v1` routes.
- Handle loading, error, and success states explicitly in UI flows.
- Follow `AGENTS.md` for repository-wide rules, including dependency approval.
