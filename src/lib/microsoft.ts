/**
 * The Microsoft app registration that Outlook and school Microsoft 365 sign-in use.
 *
 * Register Tally once (free, about 5 minutes: see the README), paste its Application (client)
 * ID below and commit it. Every build, including the installers on GitHub, then carries it and
 * people just click "Sign in with Microsoft". The ID is public by design (it is not a secret),
 * which is why it is fine to keep it in the repository.
 */
export const DEFAULT_MS_CLIENT_ID = "";

/**
 * Whether "Outlook / Microsoft 365" is offered when adding an inbox. It stays off until Tally has
 * an app registration that school and work accounts will accept. Inboxes that are already connected
 * keep working either way, and the sign-in code is all still here; flip this to bring the option back.
 */
export const MICROSOFT_SIGN_IN: boolean = false;

export const MS_REGISTRATION_URL = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/false";
export const MS_APP_NAME = "Tally";
export const MS_REDIRECT = "http://localhost";
export const MS_PERMISSIONS = ["Mail.Read", "User.Read", "offline_access"];
