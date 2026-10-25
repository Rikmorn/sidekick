// The values sidekick keeps in the engine's `$.state`, which outlives a hot
// reload of the plugin's code.

/** What a session knows of itself, for the desk to read. */
export type SelfFacts = {
  name?: string;
  role: 'main' | 'worker' | 'other';
  main?: string;
  profile?: string;
};

declare module 'claude-code' {
  interface PluginState {
    sidekick: {
      /** Whether the session started as a fork, so a reload keeps a backgrounded main a main. */
      forked: boolean;
      self: SelfFacts;
    };
  }
}
