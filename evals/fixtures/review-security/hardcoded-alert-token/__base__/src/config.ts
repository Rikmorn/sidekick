function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`missing required env var: ${name}`);
  }
  return value;
}

export type Env = 'development' | 'staging' | 'production';

export interface Config {
  env: Env;
  databaseUrl: string;
  sessionSecret: string;
}

export const config: Config = {
  env: (process.env.APP_ENV as Env) ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
};
