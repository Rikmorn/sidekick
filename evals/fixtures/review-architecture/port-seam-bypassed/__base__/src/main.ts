import { SmtpMailer } from './adapters/smtp-mailer.js';
import { BillingService } from './services/billing-service.js';

export function buildBillingService(): BillingService {
  const mailer = new SmtpMailer({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 25),
    username: process.env.SMTP_USER ?? 'billing',
  });
  return new BillingService(mailer);
}
