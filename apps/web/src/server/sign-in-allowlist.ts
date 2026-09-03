/**
 * Who is allowed through the front door.
 *
 * Every sign-in mints a welcome grant, and every credit spends real BytePlus
 * money. On a laptop that does not matter; on a public URL it means anyone in
 * the world with a Google account can sign up and bill the studio. So the door
 * is closed by default in production and opened by naming who may come in.
 *
 * The list is one environment variable holding comma-separated entries. An
 * entry beginning with "@" admits a whole domain, anything else is one exact
 * address:
 *
 *   ALLOWED_SIGN_IN="@ourstudio.com,naveen@gmail.com"
 *
 * An empty list is open in development, because a local box has no strangers
 * on it and a guard that blocks the developer gets deleted. In production an
 * empty list admits nobody — a locked door you can open is a better accident
 * than an open door you did not notice.
 */
export function isAllowedToSignIn(
  email: string | null | undefined,
  rawAllowlist: string | undefined,
  isProduction: boolean,
): boolean {
  if (typeof email !== "string" || email.includes("@") === false) {
    return false;
  }

  const entries = parseAllowlist(rawAllowlist);
  if (entries.length === 0) {
    return isProduction === false;
  }

  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@"));

  return entries.some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}

export function parseAllowlist(rawAllowlist: string | undefined): string[] {
  if (typeof rawAllowlist !== "string") {
    return [];
  }
  return rawAllowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}
