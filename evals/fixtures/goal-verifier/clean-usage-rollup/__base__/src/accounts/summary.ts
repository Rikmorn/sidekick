export interface Account {
  id: string;
  name: string;
  plan: 'free' | 'team' | 'enterprise';
}

export interface AccountSummary {
  accountId: string;
  name: string;
  plan: Account['plan'];
}

export function accountSummary(account: Account): AccountSummary {
  return { accountId: account.id, name: account.name, plan: account.plan };
}
