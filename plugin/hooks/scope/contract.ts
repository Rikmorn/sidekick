// What a profile's `hide` key and the scope mod share: the mod parts a profile
// can switch off. This file imports nothing: `bin/` imports it under NodeNext,
// and the module loader allows relative files only.

/** The sidekick mod parts a profile can switch off. */
export const MOD_PARTS = ['board', 'desk'] as const;
export type ModPart = (typeof MOD_PARTS)[number];
