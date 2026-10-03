import { describe, it, expect } from "vitest";
import type { RoundStatus } from "@/lib/types";

/**
 * Status transition rules used by host controls / API.
 * Kept here as pure logic so the UI and API stay aligned.
 */
const ALLOWED: Record<RoundStatus, RoundStatus[]> = {
  setup: ["active", "ready_for_export", "closed"],
  active: ["ready_for_export", "closed"],
  ready_for_export: ["active", "closed", "archived"],
  closed: ["active", "archived", "ready_for_export"],
  archived: [],
};

function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

function canWriteScores(status: RoundStatus): boolean {
  return status !== "closed" && status !== "archived";
}

function canExport(status: RoundStatus): boolean {
  return status === "ready_for_export" || status === "closed";
}

describe("flow: round lifecycle", () => {
  it("allows setup → active → ready_for_export → closed", () => {
    expect(canTransition("setup", "active")).toBe(true);
    expect(canTransition("active", "ready_for_export")).toBe(true);
    expect(canTransition("ready_for_export", "closed")).toBe(true);
  });

  it("blocks score writes when closed or archived", () => {
    expect(canWriteScores("setup")).toBe(true);
    expect(canWriteScores("active")).toBe(true);
    expect(canWriteScores("ready_for_export")).toBe(true);
    expect(canWriteScores("closed")).toBe(false);
    expect(canWriteScores("archived")).toBe(false);
  });

  it("only allows export when ready_for_export or closed", () => {
    expect(canExport("setup")).toBe(false);
    expect(canExport("active")).toBe(false);
    expect(canExport("ready_for_export")).toBe(true);
    expect(canExport("closed")).toBe(true);
    expect(canExport("archived")).toBe(false);
  });

  it("does not allow transitions out of archived", () => {
    expect(canTransition("archived", "active")).toBe(false);
    expect(canTransition("archived", "closed")).toBe(false);
  });
});

describe("flow: score conflict versioning", () => {
  function detectConflict(
    clientVersion: number | undefined,
    serverVersion: number
  ): boolean {
    if (clientVersion === undefined) return false;
    return clientVersion !== serverVersion;
  }

  it("flags conflict when client version is stale", () => {
    expect(detectConflict(1, 2)).toBe(true);
    expect(detectConflict(2, 2)).toBe(false);
    expect(detectConflict(undefined, 5)).toBe(false);
  });
});

describe("flow: display name uniqueness", () => {
  function isNameTaken(
    existing: string[],
    candidate: string
  ): boolean {
    const normalized = candidate.trim().toLowerCase();
    return existing.some((n) => n.trim().toLowerCase() === normalized);
  }

  it("treats names as case-insensitive unique within a round", () => {
    expect(isNameTaken(["Sam", "Alex"], "sam")).toBe(true);
    expect(isNameTaken(["Sam", "Alex"], "  SAM  ")).toBe(true);
    expect(isNameTaken(["Sam", "Alex"], "Jordan")).toBe(false);
  });
});
