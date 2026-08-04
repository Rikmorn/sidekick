import type { MailerPort } from '../ports/mailer.js';

export interface Account {
  id: string;
  billingEmail: string;
  daysOverdue: number;
}

const REMINDER_DAYS = [3, 7, 14];

export class BillingService {
  constructor(private readonly mailer: MailerPort) {}

  isReminderDue(account: Account): boolean {
    return REMINDER_DAYS.includes(account.daysOverdue);
  }

  async sendReminder(account: Account): Promise<void> {
    if (!this.isReminderDue(account)) return;
    await this.mailer.send({
      to: account.billingEmail,
      subject: 'Payment reminder',
      body: `Account ${account.id} is ${account.daysOverdue} days overdue.`,
    });
  }
}
