import type { Register } from 'claude-code';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';
import { registerScope } from './scope/scope';

export const register: Register = (on) => {
  registerGauge(on);
  registerScope(on);
  registerDesk(on);
};
