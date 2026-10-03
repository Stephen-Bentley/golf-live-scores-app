import { describe, it, expect } from "vitest";

/**
 * Mirrors the score-entry Next → auto-save decision logic.
 */
function shouldAttemptSave(input: {
  inputValue: string;
  existingGross?: number;
  closed: boolean;
}): { attempt: boolean; reason: string } {
  if (input.closed) {
    return { attempt: false, reason: "closed" };
  }
  const value = Number(input.inputValue);
  const hasValidScore =
    input.inputValue !== "" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 20;

  if (!hasValidScore) {
    if (input.inputValue !== "") {
      return { attempt: false, reason: "invalid" };
    }
    return { attempt: false, reason: "empty" };
  }

  if (input.existingGross === value) {
    return { attempt: false, reason: "unchanged" };
  }

  return { attempt: true, reason: "dirty" };
}

describe("flow: next-hole auto-save decisions", () => {
  it("saves when a new valid score is entered", () => {
    expect(
      shouldAttemptSave({ inputValue: "4", closed: false }).attempt
    ).toBe(true);
  });

  it("skips save when score is unchanged", () => {
    const result = shouldAttemptSave({
      inputValue: "4",
      existingGross: 4,
      closed: false,
    });
    expect(result.attempt).toBe(false);
    expect(result.reason).toBe("unchanged");
  });

  it("does not save when round is closed", () => {
    expect(
      shouldAttemptSave({ inputValue: "4", closed: true }).attempt
    ).toBe(false);
  });

  it("rejects invalid scores without saving", () => {
    expect(
      shouldAttemptSave({ inputValue: "0", closed: false }).reason
    ).toBe("invalid");
    expect(
      shouldAttemptSave({ inputValue: "21", closed: false }).reason
    ).toBe("invalid");
    expect(
      shouldAttemptSave({ inputValue: "3.5", closed: false }).reason
    ).toBe("invalid");
  });

  it("allows navigation with empty input without saving", () => {
    const result = shouldAttemptSave({ inputValue: "", closed: false });
    expect(result.attempt).toBe(false);
    expect(result.reason).toBe("empty");
  });

  it("saves when the player changes a previously saved score", () => {
    const result = shouldAttemptSave({
      inputValue: "6",
      existingGross: 4,
      closed: false,
    });
    expect(result.attempt).toBe(true);
    expect(result.reason).toBe("dirty");
  });
});
