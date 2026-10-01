import crypto from "crypto";
import { env } from "../config/env";

/*
Encrypts GitHub access tokens before they are written to Mongo.

A GitHub token here carries the `repo` scope — read and write access to
every repository the user owns. Stored in the clear, a database dump or a
stray query that forgets to project the field hands an attacker full
control of the user's source code. Encrypting at rest means the database
alone is not enough; the attacker also needs TOKEN_ENCRYPTION_KEY, which
lives in the environment and never in the database.

AES-256-GCM is used because it authenticates as well as encrypts, so a
tampered ciphertext fails to decrypt rather than returning garbage.

Stored format:  v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
The version prefix lets us rotate the algorithm later and still read old
rows, and lets decrypt() recognise a legacy plaintext value.
*/

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for

function getKey(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex");
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

/*
Returns null when the value cannot be decrypted — a rotated key, a
corrupted row, or tampering. Callers treat null the same as "no token",
which sends the user back through the GitHub sign-in rather than
crashing the request.
*/
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;

  // Rows written before encryption was introduced are plain tokens.
  // They are re-encrypted on the user's next sign-in.
  if (!stored.startsWith(`${VERSION}:`)) return stored;

  try {
    const [, ivHex, authTagHex, ciphertextHex] = stored.split(":");

    if (!ivHex || !authTagHex || !ciphertextHex) return null;

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.error("[crypto] Failed to decrypt stored token");
    return null;
  }
}

/** True when the value is already encrypted, used by the migration script. */
export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${VERSION}:`));
}
