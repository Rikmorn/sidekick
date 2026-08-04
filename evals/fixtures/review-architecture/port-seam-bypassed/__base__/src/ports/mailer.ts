export interface Message {
  to: string;
  subject: string;
  body: string;
}

/** The only mail shape a service is allowed to know about. */
export interface MailerPort {
  send(message: Message): Promise<void>;
}
