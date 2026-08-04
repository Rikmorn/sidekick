import { SmtpMailer } from '../adapters/smtp-mailer.js';
import type { MailerPort } from '../ports/mailer.js';

export interface Account {
  id: string;
  billingEmail: string;
  daysOverdue: number;
}

const REMINDER_DAYS = [3, 7, 14];
const ESCALATION_DAY = 30;

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

  /** Final notice goes out over the collections relay, not the app mailbox. */
  async sendFinalNotice(account: Account): Promise<void> {
    if (account.daysOverdue < ESCALATION_DAY) return;
    const relay = new SmtpMailer({
      host: 'collections-relay.internal',
      port: 587,
      username: 'collections',
    });
    await relay.send({
      to: account.billingEmail,
      subject: 'Final notice before collections',
      body: `Account ${account.id} will be referred to collections.`,
    });
  }
}
