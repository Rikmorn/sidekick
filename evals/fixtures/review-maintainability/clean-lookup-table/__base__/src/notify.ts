export const CHANNELS = {
  Email: 'email',
  Sms: 'sms',
  Push: 'push',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export function subjectFor(channel: Channel, actor: string): string {
  if (channel === 'email') {
    return `${actor} mentioned you`;
  }
  if (channel === 'sms') {
    return `${actor} mentioned you - reply STOP to opt out`;
  }
  return `${actor} mentioned you in a thread`;
}
