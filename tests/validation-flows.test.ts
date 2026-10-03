import { describe, it, expect } from "vitest";
import {
  createRoundSchema,
  joinRoundSchema,
  scoreUpdateSchema,
  playingHandicapSchema,
  grossScoreSchema,
  teeSetSnapshotSchema,
} from "@/lib/types";
import { holes18 } from "./fixtures";
import {
  makeJoinCode,
  normalizeJoinCode,
  isValidJoinCodeFormat,
} from "@/lib/join-code";

describe("flow: create round validation", () => {
  const validSnapshot = {
    name: "White",
    colour: "White",
    holes: holes18.map((h) => ({
      number: h.number,
      par: h.par,
      strokeIndex: h.strokeIndex,
      distance: h.distance ?? null,
    })),
  };

  it("accepts a valid 18-hole round payload", () => {
    const parsed = createRoundSchema.parse({
      courseName: "Royal Test",
      courseLocation: "Somewhere",
      teeSetSnapshot: validSnapshot,
    });
    expect(parsed.courseName).toBe("Royal Test");
    expect(parsed.teeSetSnapshot.holes).toHaveLength(18);
  });

  it("accepts 9-hole snapshots and rejects empty", () => {
    expect(
      teeSetSnapshotSchema.parse({
        name: "White",
        colour: "White",
        holes: validSnapshot.holes.slice(0, 9),
      }).holes
    ).toHaveLength(9);
    expect(() =>
      teeSetSnapshotSchema.parse({
        name: "White",
        colour: "White",
        holes: [],
      })
    ).toThrow();
  });

  it("rejects invalid par and stroke index", () => {
    expect(() =>
      teeSetSnapshotSchema.parse({
        name: "White",
        colour: "White",
        holes: validSnapshot.holes.map((h, i) =>
          i === 0 ? { ...h, par: 2 } : h
        ),
      })
    ).toThrow();
  });
});

describe("flow: join round validation", () => {
  it("accepts join code, name, and handicap", () => {
    const parsed = joinRoundSchema.parse({
      joinCode: "ABCD12",
      displayName: "  Sam  ",
      playingHandicap: 14,
    });
    expect(parsed.displayName).toBe("Sam");
    expect(parsed.playingHandicap).toBe(14);
  });

  it("rejects empty display names and out-of-range handicaps", () => {
    expect(() =>
      joinRoundSchema.parse({
        joinCode: "ABCD12",
        displayName: "   ",
        playingHandicap: 14,
      })
    ).toThrow();
    expect(() => playingHandicapSchema.parse(55)).toThrow();
    expect(() => playingHandicapSchema.parse(-1)).toThrow();
  });

  it("normalizes join codes for share links", () => {
    expect(normalizeJoinCode(" abcd12 ")).toBe("ABCD12");
    expect(isValidJoinCodeFormat("ABCD12")).toBe(true);
    expect(isValidJoinCodeFormat("ab")).toBe(false);
    expect(isValidJoinCodeFormat("has spaces")).toBe(false);
  });

  it("generates unique-looking join codes of length 6", () => {
    const codes = new Set(Array.from({ length: 50 }, () => makeJoinCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toHaveLength(6);
      expect(isValidJoinCodeFormat(code)).toBe(true);
    }
  });
});

describe("flow: score update validation", () => {
  it("accepts valid hole scores", () => {
    const parsed = scoreUpdateSchema.parse({
      holeNumber: 7,
      grossScore: 4,
      clientVersion: 1,
    });
    expect(parsed.holeNumber).toBe(7);
    expect(parsed.grossScore).toBe(4);
  });

  it("rejects scores outside 1–20 and invalid holes", () => {
    expect(() => grossScoreSchema.parse(0)).toThrow();
    expect(() => grossScoreSchema.parse(21)).toThrow();
    expect(() =>
      scoreUpdateSchema.parse({ holeNumber: 0, grossScore: 4 })
    ).toThrow();
    expect(() =>
      scoreUpdateSchema.parse({ holeNumber: 19, grossScore: 4 })
    ).toThrow();
  });
});
