/**
 * Public-facing constants. Kept in one place because they are the things most
 * likely to change without any code changing around them.
 */

export const PRIVACY_POLICY_URL =
  'https://pratham-2105.github.io/prescription-vault/privacy.html';

export const SOURCE_URL = 'https://github.com/Pratham-2105/prescription-vault';

/**
 * Where interest in cloud backup goes.
 *
 * A mailto rather than in-app telemetry, and that is the whole point: the app
 * makes no network calls and collects nothing, which is a claim in the privacy
 * policy. Measuring interest silently would make that claim false. This way the
 * user actively chooses to leave and say so — a weaker funnel and a stronger
 * signal, since someone who sends an email wants it more than someone who
 * tapped a button.
 *
 * Swap for a form URL when there is one; only this constant changes.
 */
export const FEEDBACK_EMAIL = 'contact.pratham21@gmail.com';