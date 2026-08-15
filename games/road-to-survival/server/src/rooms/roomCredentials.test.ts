import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  generateRoomPassword,
  hashRoomPassword,
  verifyRoomPassword,
} from "./roomCredentials.js";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz";
const PASSWORD_LENGTH = 10;

describe("generateRoomCode", () => {
  it("produces codes of the expected length using only the expected alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((char) => CODE_ALPHABET.includes(char))).toBe(true);
    }
  });

  it("varies across repeated calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateRoomPassword", () => {
  it("produces passwords of the expected length using only the expected alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateRoomPassword();
      expect(password).toHaveLength(PASSWORD_LENGTH);
      expect([...password].every((char) => PASSWORD_ALPHABET.includes(char))).toBe(true);
    }
  });

  it("varies across repeated calls", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateRoomPassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});

describe("hashRoomPassword / verifyRoomPassword", () => {
  it("verifies a password against its own hash", async () => {
    const password = generateRoomPassword();
    const hash = await hashRoomPassword(password);
    await expect(verifyRoomPassword(password, hash)).resolves.toBe(true);
  });

  it("fails verification for an incorrect password", async () => {
    const hash = await hashRoomPassword("correct-password");
    await expect(verifyRoomPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
