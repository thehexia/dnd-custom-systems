import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz";
const PASSWORD_LENGTH = 10;

function randomString(alphabet: string, length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[randomInt(alphabet.length)];
  }
  return result;
}

export function generateRoomCode(): string {
  return randomString(CODE_ALPHABET, CODE_LENGTH);
}

export function generateRoomPassword(): string {
  return randomString(PASSWORD_ALPHABET, PASSWORD_LENGTH);
}

export function hashRoomPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyRoomPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
