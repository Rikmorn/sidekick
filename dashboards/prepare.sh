#!/usr/bin/env bash
# ops-6 (ADR-0007 D8) — dashboard prepare step: glue, not kernel.
#
# Rebuilds the graph, writes the four data JSONs the views read, then embeds
# them into _generated-data.qmd as base64 OJS cells. The data is embedded at
# render time and never fetched, so the rendered site works over file:// (D1):
# browsers block fetch()/module loads over file://, so there is no FileAttachment
# of separate data files. Base64 keeps doc titles (backticks, quotes, em-dashes)
# out of the JS string literal; the payload is ASCII-escaped JSON so the
# browser-side `JSON.parse(atob(...))` roundtrips losslessly.
#
# Everything written here is derived and gitignored. The committed part is the
# view definitions (_quarto.yml, index.qmd) and this script.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT"

DATA="dashboards/data"
mkdir -p "$DATA"

cli() { bun bin/cli.ts "$@"; }

# 1. Rebuild the graph from the live tree so every view reads the same "now".
#    coverage reads the store; export and diff parse the tree fresh.
cli graph build >/dev/null

# 2. State rollup + coverage matrix — straight from the CLI JSON contracts.
#    coverage already folds evals/coverage-exceptions.md into unmeasured[].reason.
cli graph export          > "$DATA/state.json"
cli graph coverage --json > "$DATA/coverage.json"

# 3. Since-last-visit: diff from the previous STATE.md-touching commit to HEAD.
#    STATE.md regenerates when work concludes, so its git history is the session
#    heartbeat. No earlier commit ⇒ no last visit ⇒ an empty object, which the
#    view renders as the honest "nothing since the last heartbeat" state.
ANCHOR="$(git log --skip 1 -1 --format=%H -- docs/STATE.md || true)"
if [ -n "$ANCHOR" ]; then
  cli graph diff "$ANCHOR" HEAD --json > "$DATA/diff.json"
else
  echo '{}' > "$DATA/diff.json"
fi

# 4. runs.json (per-record bench detail) + _generated-data.qmd (embedded data).
#    One bun step: the verdict rule must match the kernel's parseRunRecords
#    exactly (assertion-derived, not the self-reported deliverable verdict), and
#    the same step base64-embeds all four JSONs.
bun run - <<'FINALIZE'
import * as fs from 'node:fs';
import * as path from 'node:path';

const DATA = 'dashboards/data';

// Per-record bench detail from every committed records.jsonl. The verdict is
// derived from assertion outcomes the same way graph-parse-machine.ts does, so
// the trend page and the kernel's bench summary cannot disagree; the agent's own
// deliverable verdict is kept separately as deliverable_status.
function collectRuns() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'records.jsonl') {
        for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
          if (line.trim() === '') continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }
          const assertions = rec.assertions ?? [];
          const verdict =
            rec.status !== 'ok'
              ? (rec.status ?? 'unknown')
              : assertions.length === 0
                ? 'unknown'
                : assertions.every((a) => a.outcome === 'pass')
                  ? 'pass'
                  : 'fail';
          out.push({
            run_id: rec.run_id ?? null,
            suite: rec.suite ?? null,
            case_id: rec.case_id ?? null,
            model: rec.model ?? null,
            cost_usd: rec.cost_usd ?? null,
            num_turns: rec.num_turns ?? null,
            verdict,
            deliverable_status: rec.deliverable?.verdict ?? null,
            started_at: rec.started_at ?? null,
            duration_ms: rec.duration_ms ?? null,
          });
        }
      }
    }
  };
  walk('evals/results');
  return out;
}

const runs = collectRuns();
fs.writeFileSync(path.join(DATA, 'runs.json'), JSON.stringify(runs, null, 2));

// Escape every char above 0x7e to \uXXXX so the base64 payload is pure ASCII.
// atob() returns bytes-as-chars; on multi-byte UTF-8 (em-dashes in titles) that
// would mojibake. Escaped, atob() roundtrips exactly and JSON.parse turns the
// \uXXXX back into the character. Written as a char-code loop so this source
// file carries no non-ASCII literals of its own.
function asciiEscape(json) {
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    out +=
      code > 0x7e ? '\\u' + code.toString(16).padStart(4, '0') : json[i];
  }
  return out;
}

function embed(name, file) {
  const raw = fs.readFileSync(path.join(DATA, file), 'utf-8');
  const compact = JSON.stringify(JSON.parse(raw)); // validate + shrink
  const b64 = Buffer.from(asciiEscape(compact), 'ascii').toString('base64');
  // output: false — in `format: dashboard`, cells without it get no DOM slot when
  // they sit outside a page's card layout, and Quarto's OJS connector then crashes
  // on cellDiv.classList, taking dependent cells' rendering down with it.
  return '```{ojs}\n//| echo: false\n//| output: false\n' + name + ' = JSON.parse(atob("' + b64 + '"))\n```';
}

const cells = [
  embed('state', 'state.json'),
  embed('coverage', 'coverage.json'),
  embed('diff', 'diff.json'),
  embed('runs', 'runs.json'),
];
const header =
  '<!-- Generated by dashboards/prepare.sh. Do not edit by hand: regenerate. -->\n';
fs.writeFileSync(
  'dashboards/_generated-data.qmd',
  header + cells.join('\n\n') + '\n',
);
console.log(
  `embedded ${runs.length} run record(s) -> dashboards/_generated-data.qmd`,
);
FINALIZE

echo "prepare: wrote $DATA/{state,coverage,diff,runs}.json + dashboards/_generated-data.qmd"
