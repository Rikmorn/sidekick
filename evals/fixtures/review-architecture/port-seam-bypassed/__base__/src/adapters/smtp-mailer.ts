import type { MailerPort, Message } from '../ports/mailer.js';

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
}

export class SmtpMailer implements MailerPort {
  constructor(private readonly config: SmtpConfig) {}

  async send(message: Message): Promise<void> {
    // Real implementation opens a socket to this.config.host and speaks SMTP.
    void this.config;
    void message;
  }
}
