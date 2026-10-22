import type { CommandSpec, EngineInterface } from 'claude-code';

/** The `rows` every sidekick pane asks for at its open: the engine caps a request at what the layout spares, and an inline frame fits its tree. */
export const PANE_ROWS = 1_000;

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
    const reason = error instanceof Error ? error.message : String(error);
    $.ui.log(`sidekick ${tag}: /${spec.name} not registered: ${reason}`, {
      to: 'debug',
    });
    return false;
  }
}
