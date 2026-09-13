# admin-web

React 19 with Vite. Server state through TanStack Query hooks; no global client store. Features live in `src/features/<name>/`. Design tokens in `src/theme/`.

## Architectural decisions

- User preferences are read and written through the existing `usePreferences` / `useUpdatePreferences` hooks in `src/features/preferences/`, backed by `PATCH /me/preferences`.
- See `.claude/rules/architecture.md` for the feature-folder rule.
