import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { createRoomPlayer } from "./rooms.js";
import { deleteVote, loadOrCreateWeekCards, upsertVote } from "./segmentCards.js";

function uniqueCode(): string {
  return `T${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

async function createTestRoom() {
  return prisma.room.create({ data: { code: uniqueCode(), passwordHash: "hashed" } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadOrCreateWeekCards against real Postgres", () => {
  it("generates a card for every segment of a week that has none yet", async () => {
    const room = await createTestRoom();

    const cards = await loadOrCreateWeekCards(room.id, 1, 4);

    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.segment)).toEqual([1, 2, 3, 4]);
    for (const card of cards) {
      const options = card.options as { skill: string; dc: number }[];
      expect(options).toHaveLength(4);
      expect(new Set(options.map((o) => o.skill)).size).toBe(4);
      expect(card.votes).toEqual([]);
    }
  });

  it("is idempotent: a second call for the same week returns identical card contents", async () => {
    const room = await createTestRoom();

    const first = await loadOrCreateWeekCards(room.id, 1, 3);
    const second = await loadOrCreateWeekCards(room.id, 1, 3);

    expect(second.map((c) => ({ id: c.id, options: c.options }))).toEqual(
      first.map((c) => ({ id: c.id, options: c.options })),
    );
  });

  it("self-heals only the segments missing from an already-partially-generated week", async () => {
    const room = await createTestRoom();

    const partial = await loadOrCreateWeekCards(room.id, 1, 2);
    const healed = await loadOrCreateWeekCards(room.id, 1, 4);

    expect(healed).toHaveLength(4);
    // The originally-generated segments 1-2 keep their ids and options -- healing only adds
    // rows for the previously-missing segments 3-4, it doesn't touch what already existed.
    expect(healed[0]).toMatchObject({ id: partial[0].id, options: partial[0].options });
    expect(healed[1]).toMatchObject({ id: partial[1].id, options: partial[1].options });
  });

  it("enforces (roomId, week, segment) uniqueness at the database level", async () => {
    const room = await createTestRoom();
    await prisma.roomSegmentCard.create({
      data: { roomId: room.id, week: 1, segment: 1, options: [] },
    });

    await expect(
      prisma.roomSegmentCard.create({ data: { roomId: room.id, week: 1, segment: 1, options: [] } }),
    ).rejects.toThrow();
  });

  it("loads previously-cast votes alongside their card", async () => {
    const room = await createTestRoom();
    const player = await createRoomPlayer(room.id, "alice", false);
    const [card] = await loadOrCreateWeekCards(room.id, 1, 1);

    await upsertVote(card.id, player.id, 2);

    const [reloaded] = await loadOrCreateWeekCards(room.id, 1, 1);
    expect(reloaded.votes).toHaveLength(1);
    expect(reloaded.votes[0]).toMatchObject({ roomPlayerId: player.id, optionIndex: 2 });
    expect(reloaded.votes[0].roomPlayer.username).toBe("alice");
  });
});

describe("upsertVote against real Postgres", () => {
  it("records a player's first vote on a card", async () => {
    const room = await createTestRoom();
    const player = await createRoomPlayer(room.id, "bob", false);
    const [card] = await loadOrCreateWeekCards(room.id, 1, 1);

    const vote = await upsertVote(card.id, player.id, 0);

    expect(vote.optionIndex).toBe(0);
    expect(vote.roomPlayer.username).toBe("bob");
  });

  it("replaces a player's existing vote on the same card instead of creating a second row", async () => {
    const room = await createTestRoom();
    const player = await createRoomPlayer(room.id, "carol", false);
    const [card] = await loadOrCreateWeekCards(room.id, 1, 1);

    await upsertVote(card.id, player.id, 1);
    const moved = await upsertVote(card.id, player.id, 3);

    expect(moved.optionIndex).toBe(3);
    const votes = await prisma.roomSegmentVote.findMany({ where: { cardId: card.id, roomPlayerId: player.id } });
    expect(votes).toHaveLength(1);
    expect(votes[0].optionIndex).toBe(3);
  });
});

describe("deleteVote against real Postgres", () => {
  it("removes an existing vote row", async () => {
    const room = await createTestRoom();
    const player = await createRoomPlayer(room.id, "dave", false);
    const [card] = await loadOrCreateWeekCards(room.id, 1, 1);
    await upsertVote(card.id, player.id, 0);

    await deleteVote(card.id, player.id);

    const votes = await prisma.roomSegmentVote.findMany({ where: { cardId: card.id, roomPlayerId: player.id } });
    expect(votes).toHaveLength(0);
  });

  it("does not throw when no matching vote exists", async () => {
    const room = await createTestRoom();
    const player = await createRoomPlayer(room.id, "erin", false);
    const [card] = await loadOrCreateWeekCards(room.id, 1, 1);

    await expect(deleteVote(card.id, player.id)).resolves.not.toThrow();
  });
});
