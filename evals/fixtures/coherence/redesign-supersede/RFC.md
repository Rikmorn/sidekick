---
slug: redesign-supersede
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: store uploaded files durably and serve them back.

## Architecture

Uploads are streamed to object storage (S3-compatible); the app keeps only the
object key and metadata in its database. Files never live on local disk.

## Decisions

- D-01: keep uploaded files on the app server's local disk.

## Questions

- What retention policy applies to orphaned objects?

## Risks

- Object-store outages block uploads.

## Redesigns

- R-01: supersede D-01 — move file storage from local disk to object storage.
  Local disk did not survive horizontal scaling; object storage replaces it and
  is the design the Architecture now describes.
