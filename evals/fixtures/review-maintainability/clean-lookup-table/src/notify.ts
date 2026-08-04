export const CHANNELS = {
  Email: 'email',
  Sms: 'sms',
  Push: 'push',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

type SubjectBuilder = (actor: string) => string;

const SUBJECT_BY_CHANNEL = {
  email: (actor) => `${actor} mentioned you`,
  sms: (actor) => `${actor} mentioned you - reply STOP to opt out`,
  push: (actor) => `${actor} mentioned you in a thread`,
} satisfies Record<Channel, SubjectBuilder>;

export function subjectFor(channel: Channel, actor: string): string {
  return SUBJECT_BY_CHANNEL[channel](actor);
}
