import type { Room, RoomPlayer } from "@prisma/client";
import { prisma } from "./prisma.js";
import { generateRoomCode, generateRoomPassword, hashRoomPassword } from "../rooms/roomCredentials.js";

const MAX_CODE_ATTEMPTS = 10;

export async function createRoom(): Promise<{ room: Room; password: string }> {
  const password = generateRoomPassword();
  const passwordHash = await hashRoomPassword(password);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.room.findUnique({ where: { code } });
    if (existing) continue;

    const room = await prisma.room.create({ data: { code, passwordHash } });
    return { room, password };
  }

  throw new Error("Failed to generate a unique room code after multiple attempts");
}

export function findRoomByCode(code: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { code } });
}

export function findRoomPlayer(roomId: string, username: string): Promise<RoomPlayer | null> {
  return prisma.roomPlayer.findFirst({
    where: {
      roomId,
      username: { equals: username, mode: "insensitive" },
    },
  });
}

export function listRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  return prisma.roomPlayer.findMany({ where: { roomId } });
}

export function createRoomPlayer(
  roomId: string,
  username: string,
  isAdmin: boolean,
): Promise<RoomPlayer> {
  return prisma.roomPlayer.create({
    data: { roomId, username, isAdmin },
  });
}

export function saveRoomPlayerState(
  id: string,
  state: { x: number; y: number },
): Promise<RoomPlayer> {
  return prisma.roomPlayer.update({
    where: { id },
    data: state,
  });
}
