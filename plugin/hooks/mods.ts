import type { Register } from 'claude-code';
import { registerDesk } from './desk/desk';
import { registerGauge } from './gauge/gauge';

export const register: Register = (on) => {
  registerGauge(on);
  registerDesk(on);
};
