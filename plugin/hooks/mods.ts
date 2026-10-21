import type { Register } from 'claude-code';
import { registerBoard } from './board/board';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';
import { registerScope } from './scope/scope';

// Registrations nest first outermost. Each mod draws into sites of its own, so
// the order sets only which `session.start` hook runs first.
export const register: Register = (on) => {
  registerBoard(on);
  registerGauge(on);
  registerScope(on);
  registerDesk(on);
};
