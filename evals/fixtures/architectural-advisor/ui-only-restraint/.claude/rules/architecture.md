# Architecture

## Feature folders
Each feature is self-contained under `src/features/<name>/`. A feature does not import another feature's internals; shared pieces move to `src/shared/`.

## Server state
Server state lives in TanStack Query hooks. Do not introduce a global client store or a new context provider for data the server owns.
