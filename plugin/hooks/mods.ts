import type { Register } from 'claude-code';
import { registerBoard } from './board/board';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';
import { registerName } from './name/name';
import { registerRole } from './role';
import { registerScope } from './scope/scope';

// Registrations nest first outermost. The board and the gauge both draw
// `PromptHint`, the board outermost, so in a worker the board passes the
// gauge's row through; every other site, a pane by its id among them, has one
// mod. The order also sets which hooks on a shared event run first. The
// role's start hooks run first, so the role settles before the other mods'
// start hooks run.
export const register: Register = (on) => {
  registerRole(on);
  registerBoard(on);
  registerGauge(on);
  registerScope(on);
  registerDesk(on);
  registerName(on);
};
