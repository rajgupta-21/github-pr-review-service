import { describe, expect, test } from "bun:test";
import {
  countBySeverity,
  normalizeRecommendation,
  normalizeScore,
  normalizeSeverity,
} from "./reviewStore.service";

/*
These normalisers sit between the language model and the database. The
model does not reliably honour the output contract, and anything wrong
here corrupts every score and severity count the dashboards read.
*/

describe("normalizeScore", () => {
  test("scales the documented 0-10 range to 0-100", () => {
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(7)).toBe(70);
    expect(normalizeScore(10)).toBe(100);
  });

  test("passes through values the model already gave as 0-100", () => {
    // The model sometimes ignores the 0-10 instruction
    expect(normalizeScore(78)).toBe(78);
    expect(normalizeScore(100)).toBe(100);
  });

  test("clamps and floors nonsense rather than storing it", () => {
    expect(normalizeScore(250)).toBe(100);
    expect(normalizeScore(-5)).toBe(0);
    expect(normalizeScore("not a number")).toBe(0);
    expect(normalizeScore(undefined)).toBe(0);
    expect(normalizeScore(null)).toBe(0);
  });

  test("rounds fractional scores", () => {
    expect(normalizeScore(7.84)).toBe(78);
  });
});

describe("normalizeSeverity", () => {
  test("accepts the documented values", () => {
    expect(normalizeSeverity("Critical")).toBe("Critical");
    expect(normalizeSeverity("High")).toBe("High");
  });

  test("accepts whatever casing and padding the model produces", () => {
    expect(normalizeSeverity("critical")).toBe("Critical");
    expect(normalizeSeverity("  HIGH  ")).toBe("High");
  });

  test("falls back to Low so a finding is never dropped", () => {
    // Discarding an unrecognised severity would silently lose a finding;
    // counting it as Low keeps it visible without inflating the gate.
    expect(normalizeSeverity("catastrophic")).toBe("Low");
    expect(normalizeSeverity(undefined)).toBe("Low");
  });
});

describe("normalizeRecommendation", () => {
  test("maps to the two values the schema allows", () => {
    expect(normalizeRecommendation("Approve")).toBe("Approve");
    expect(normalizeRecommendation("Request Changes")).toBe("Request Changes");
  });

  test("reads a sentence rather than rejecting it", () => {
    expect(normalizeRecommendation("I would request changes here")).toBe(
      "Request Changes",
    );
  });

  test("defaults to Approve when unreadable", () => {
    expect(normalizeRecommendation("")).toBe("Approve");
    expect(normalizeRecommendation(undefined)).toBe("Approve");
  });
});

describe("countBySeverity", () => {
  test("counts each severity independently", () => {
    const findings = [
      { severity: "Critical" as const },
      { severity: "High" as const },
      { severity: "High" as const },
      { severity: "Low" as const },
    ];

    expect(countBySeverity(findings)).toEqual({
      criticalCount: 1,
      highCount: 2,
      mediumCount: 0,
      lowCount: 1,
    });
  });

  test("an empty review counts zero, not undefined", () => {
    expect(countBySeverity([])).toEqual({
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });
  });
});
