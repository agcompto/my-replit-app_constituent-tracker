import { randomBytes } from "node:crypto";

/**
 * Character set used for generated temporary passwords. We exclude visually
 * ambiguous characters (0/O, 1/l/I) so a user reading the password from an
 * email or written note doesn't get tripped up by font rendering.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Generate a strong temporary password using rejection sampling against a
 * cryptographically-secure random source. 16 characters out of a 56-character
 * alphabet gives ~92 bits of entropy — more than enough to resist brute force,
 * and short enough to be reasonable to read aloud once.
 */
export function generateTempPassword(length = 16): string {
  if (length < 12) throw new Error("Temporary passwords must be at least 12 characters");
  // Power-of-two acceptance window to make rejection sampling unbiased.
  // 256 / 56 ≈ 4.57 → reject any byte ≥ 56 * 4 = 224.
  const acceptMax = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out: string[] = [];
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < acceptMax) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}
