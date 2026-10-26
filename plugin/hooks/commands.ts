import type { CommandSpec, EngineInterface } from 'claude-code';
import { reasonOf } from './failures';

/** The `rows` every sidekick pane asks for at its open: the engine caps a request at what the layout spares, and an inline frame fits its tree. */
export const PANE_ROWS = 1_000;

/** The `columns` the desk and the board ask for at their open. A width the operator kept wins (P3 in docs/research/control-centre/2026-10-25-desk-pane-probes.md). */
export const DOCK_COLUMNS = 40;

/** Registers `spec` to run mid-turn too, and resolves whether this mod owns the command: false when the engine refused the name, which the debug log then names under `tag`. */
export async function registerOwned(
  $: EngineInterface,
  spec: CommandSpec,
  tag: string,
): Promise<boolean> {
  try {
    await $.command.register({ ...spec, immediate: true });
    return true;
  } catch (error) {
    const reason = reasonOf(error);
    $.ui.log(`sidekick ${tag}: /${spec.name} not registered: ${reason}`, {
      to: 'debug',
    });
    return false;
  }
}
