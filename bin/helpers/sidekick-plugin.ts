/**
 * Sidekick's own plugin ids, read from the two manifests `bun run build`
 * bundles, so a clean-room profile enables what the manifests name.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import marketplaceJson from '../../.claude-plugin/marketplace.json' with {
  type: 'json',
};
import pluginJson from '../../plugin/.claude-plugin/plugin.json' with {
  type: 'json',
};

const NameSchema = v.object({ name: v.pipe(v.string(), v.minLength(1)) });

const PluginSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  dependencies: v.array(
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      marketplace: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
});

const plugin = v.parse(PluginSchema, pluginJson);
const marketplace = v.parse(NameSchema, marketplaceJson);

/** Sidekick's plugin id, `<plugin>@<marketplace>`. */
export const SIDEKICK_ID: string = `${plugin.name}@${marketplace.name}`;

/** The id of each plugin sidekick's manifest depends on. */
export const SIDEKICK_DEPENDENCY_IDS: readonly string[] =
  plugin.dependencies.map((d) => `${d.name}@${d.marketplace}`);

/** Whether `dir` holds sidekick's plugin manifest; false when it is unreadable or invalid. */
export function isSidekickPlugin(dir: string): boolean {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const parsed = v.safeParse(NameSchema, raw);
    return parsed.success && parsed.output.name === plugin.name;
  } catch {
    return false;
  }
}
