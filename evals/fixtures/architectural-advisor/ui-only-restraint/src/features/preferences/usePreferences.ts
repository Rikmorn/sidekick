export interface Preferences { locale: string; emailDigest: boolean; }
export function usePreferences(): { data: Preferences | undefined } { return { data: undefined }; }
export function useUpdatePreferences(): { mutate: (patch: Partial<Preferences>) => void } { return { mutate: () => {} }; }
