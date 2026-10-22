import type { Register } from 'claude-code';
import { registerBoard } from './board/board';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';
import { registerRole } from './role';
import { registerScope } from './scope/scope';

// Registrations nest first outermost. Each mod draws into sites of its own, so
// the order sets only which start hooks run first. The role's run first, so
// the role settles before the other mods' start hooks run.
export const register: Register = (on) => {
  registerRole(on);
  registerBoard(on);
  registerGauge(on);
  registerScope(on);
  registerDesk(on);
};
