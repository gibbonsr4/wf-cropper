/**
 * Generate a unique identifier. Uses crypto.randomUUID() when available (modern
 * browsers in a secure context: HTTPS or localhost). Falls back to a non-
 * compliant but collision-resistant random string for non-secure contexts
 * (e.g. http:// internal subdomains) and very old browsers where randomUUID
 * is missing.
 *
 * These IDs are used for template/output keys in React lists and for storing
 * per-output crop state in Maps. UUID spec compliance isn't required — we
 * just need uniqueness within a single app session.
 */
export function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + 10 random base36 chars = ~52 bits of entropy per ID.
  // Collision probability within a single session is negligible.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
