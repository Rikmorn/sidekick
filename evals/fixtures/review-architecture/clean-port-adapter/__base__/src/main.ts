import { SystemClock } from './adapters/system-clock.js';
import { TokenService } from './services/token-service.js';

export function buildTokenService(): TokenService {
  return new TokenService(new SystemClock());
}
