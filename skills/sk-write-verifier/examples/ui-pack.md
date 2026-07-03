# UI dimension catalogue

Further UI dimensions, instantiated the same way as `ui-color.md` (that file
is the full pattern — copy it, swap the dimension, ground truth, and counting
examples). Per dimension: where its truth usually lives, and what a finding
looks like. All of these are taste dimensions — they mount `advisory` and
stay advisory; taste has no sound autonomous gate.

## ui-typography

**Ground truth:** the type scale — font-size/weight/line-height tokens
(`tailwind.config` `fontSize`, a `typography.css`, or the design system's
text components). **Findings:** raw `font-size: 13px` bypassing the scale;
ad-hoc font weights; text components skipped in favour of styled primitives
(`<span style={{fontSize}}>` where `<Text size="sm">` exists).

## ui-spacing

**Ground truth:** the spacing scale (spacing tokens, grid units).
**Findings:** magic-number margins/paddings (`margin: 13px`) off the scale;
mixed units where the system standardises one; inconsistent gaps between
sibling components doing the same job.

## ui-hierarchy

**Ground truth:** heading/landmark conventions — often a style guide or the
existing page patterns rather than a token file (grep the nearest analogous
page). **Findings:** skipped heading levels (h1 → h3); multiple h1s; visual
hierarchy contradicting semantic hierarchy (a subsection styled larger than
its parent).

## ui-interaction

**Ground truth:** the design system's state conventions — hover/focus/
active/disabled variants on the base components. **Findings:** interactive
elements missing focus-visible styles; disabled states styled but not
functionally disabled (or vice versa); custom clickables that don't reuse
the system's state tokens.

## ui-a11y

**Ground truth:** WCAG plus the project's own accessibility notes if any.
**Findings:** contrast below AA against the palette tokens actually used;
images without alt; interactive elements without accessible names;
keyboard traps in changed modal/menu code. Of the pack this is the least
taste-like — findings cite a public standard — but contrast/context
judgments still warrant `advisory` until calibrated.

## Instantiation notes

- One verifier per dimension, even when the same person wants all five —
  a combined "ui-verifier" muddles the findings sections and can't be
  mounted or retired independently.
- Registry entries collide by dimension name per surface: these five names
  are free on every surface (no bundled dimension uses them).
- Expect to tune after the first live review: taste dimensions start noisy,
  and the tuning loop (tighten the ground truth, adjust severity guidance,
  add one counting example) is the normal path, not a failure.
