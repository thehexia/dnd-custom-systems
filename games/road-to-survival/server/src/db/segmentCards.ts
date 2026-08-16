import type { Prisma, RoomSegmentCard, RoomSegmentVote, RoomPlayer } from "@prisma/client";
import { prisma } from "./prisma.js";
import { generateCard } from "../rooms/cardGeneration.js";

export type RoomSegmentCardWithVotes = RoomSegmentCard & {
  votes: (RoomSegmentVote & { roomPlayer: RoomPlayer })[];
};

const WITH_VOTES = {
  votes: { include: { roomPlayer: true } },
} satisfies Prisma.RoomSegmentCardInclude;

// Idempotent per (roomId, week, segment) via the DB's unique constraint: loads whatever cards
// already exist for the week and generates only the segments still missing, so calling this for
// an already-fully-generated week is a pure read (see specs/road-to-survival-skill-check-cards -
// Card Generation Timing).
export async function loadOrCreateWeekCards(
  roomId: string,
  week: number,
  totalSegments: number,
): Promise<RoomSegmentCardWithVotes[]> {
  const existing = await prisma.roomSegmentCard.findMany({
    where: { roomId, week },
    include: WITH_VOTES,
  });

  const existingSegments = new Set(existing.map((card) => card.segment));
  const missingSegments: number[] = [];
  for (let segment = 1; segment <= totalSegments; segment++) {
    if (!existingSegments.has(segment)) missingSegments.push(segment);
  }

  if (missingSegments.length === 0) {
    return existing.sort((a, b) => a.segment - b.segment);
  }

  await prisma.roomSegmentCard.createMany({
    data: missingSegments.map((segment) => ({
      roomId,
      week,
      segment,
      options: generateCard() as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  const all = await prisma.roomSegmentCard.findMany({ where: { roomId, week }, include: WITH_VOTES });
  return all.sort((a, b) => a.segment - b.segment);
}

export function upsertVote(
  cardId: string,
  roomPlayerId: string,
  optionIndex: number,
): Promise<RoomSegmentVote & { roomPlayer: RoomPlayer }> {
  return prisma.roomSegmentVote.upsert({
    where: { cardId_roomPlayerId: { cardId, roomPlayerId } },
    create: { cardId, roomPlayerId, optionIndex },
    update: { optionIndex },
    include: { roomPlayer: true },
  });
}
