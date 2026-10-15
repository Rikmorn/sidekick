import type { Register } from 'claude-code';
import { registerGauge } from './gauge/gauge';

export const register: Register = (on) => {
  registerGauge(on);
};
