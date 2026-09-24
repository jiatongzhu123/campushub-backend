# CampusHub Backend Agent Instructions

These rules govern all AI coding agent work in this repository.

## Tech stack and dependencies

- Write application source in TypeScript only. Do not create raw JavaScript (`.js`) source files.
- Use Node.js, Express, and Mongoose for the backend.
- Do not add, install, or introduce a library or dependency without explicit approval.

## Architecture

Keep responsibilities in their assigned layers:

- **Routes:** Define endpoints and map middleware and controllers. Do not put business logic in routes.
- **Controllers:** Handle requests and responses, including HTTP status codes. Delegate business operations to services. Do not query the database or call Mongoose models directly.
- **Services:** Implement business logic and coordinate data access through models. Keep HTTP request and response handling out of services.
- **Models:** Define Mongoose schemas and TypeScript interfaces only. Do not put route, controller, or service logic in models.

## Type safety and asynchronous work

- Declare explicit TypeScript types or interfaces for function parameters and return values, and for database schemas and documents.
- Do not use the `any` type.
- Handle asynchronous errors through the appropriate layer and ensure every promise is awaited, returned, or explicitly handled. Do not leave unhandled promises.
- Prefer clear, maintainable, strongly typed code.

## Change summary

After making code changes, provide a concise PR/diff-style summary that states what changed, why it changed, and how these repository rules were followed.
