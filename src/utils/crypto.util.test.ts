import { describe, expect, test } from "bun:test";
import { decryptToken, encryptToken, isEncrypted } from "./crypto.util";

describe("token encryption", () => {
  test("a token survives a round trip", () => {
    const token = "gho_abcdefghijklmnopqrstuvwxyz0123456789";

    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  test("the same token encrypts differently each time", () => {
    // A fresh IV per call, so identical tokens do not produce identical
    // ciphertext — otherwise the database would leak which users share one.
    const token = "gho_same_token_twice";

    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  test("ciphertext does not contain the plaintext", () => {
    const token = "gho_secret_value_here";

    expect(encryptToken(token)).not.toContain(token);
  });

  test("tampered ciphertext fails instead of returning garbage", () => {
    const encrypted = encryptToken("gho_original");
    const parts = encrypted.split(":");
    // Flip the final byte of the ciphertext
    const body = parts[3]!;
    parts[3] = body.slice(0, -2) + (body.slice(-2) === "00" ? "01" : "00");

    expect(decryptToken(parts.join(":"))).toBeNull();
  });

  test("values written before encryption are returned as-is", () => {
    // Rows predating this feature hold a plain token and must keep working
    // until the user's next sign-in re-encrypts them.
    expect(decryptToken("gho_legacy_plaintext")).toBe("gho_legacy_plaintext");
  });

  test("absent tokens are null, not a crash", () => {
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
    expect(decryptToken("")).toBeNull();
  });

  test("isEncrypted distinguishes stored formats", () => {
    expect(isEncrypted(encryptToken("gho_x"))).toBe(true);
    expect(isEncrypted("gho_plaintext")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
