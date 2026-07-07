---
slug: intra-decisions-conflict
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: process uploaded videos into thumbnails.

## Architecture

Uploaded videos are handed to a processing stage that produces thumbnails.

## Decisions

- D-01: process each upload synchronously within the request so the response
  includes the thumbnail URL.
- D-02: process uploads asynchronously on a background queue; the request
  returns immediately, before any thumbnail exists.

## Questions

- What thumbnail sizes are needed?

## Risks

- Large videos slow processing.
