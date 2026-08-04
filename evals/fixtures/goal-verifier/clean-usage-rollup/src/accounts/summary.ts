import {
  type BillingPeriod,
  eventsForAccount,
  type UsageEvent,
} from '../usage/events.js';
import { countInPeriod } from '../usage/rollup.js';

export interface Account {
  id: string;
  name: string;
  plan: 'free' | 'team' | 'enterprise';
}

export interface AccountSummary {
  accountId: string;
  name: string;
  plan: Account['plan'];
  eventsThisPeriod: number;
}

export function accountSummary(
  account: Account,
  events: UsageEvent[],
  period: BillingPeriod,
): AccountSummary {
  const mine = eventsForAccount(events, account.id);
  return {
    accountId: account.id,
    name: account.name,
    plan: account.plan,
    eventsThisPeriod: countInPeriod(mine, period),
  };
}
