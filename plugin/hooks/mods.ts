import type { Register } from 'claude-code';
import { registerBoard } from './board/board';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';
import { registerScope } from './scope/scope';

// The board goes first: registrations nest first outermost, so its lines sit
// above the desk's band.
export const register: Register = (on) => {
  registerBoard(on);
  registerGauge(on);
  registerScope(on);
  registerDesk(on);
};
