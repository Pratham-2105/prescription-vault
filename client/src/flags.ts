/**
 * Build-time feature flags.
 *
 * `CLOUD_ENABLED` false is the shipping configuration: no accounts, no sign-in
 * screen, everything on the device. Flipping it to true restores the auth
 * screens and the HTTP repositories — one codebase, not two versions, because
 * two would diverge within a week.
 *
 * Read from the environment so a build can override it without a code change.
 * EXPO_PUBLIC_* variables are inlined at bundle time, so Metro must be
 * restarted after changing one.
 */
export const CLOUD_ENABLED: boolean = process.env.EXPO_PUBLIC_CLOUD_ENABLED === 'true';