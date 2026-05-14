import { describe, expect, it } from "vitest";
import { shouldAcceptRevision } from "./freshness";

describe("game freshness helpers", () => {
  it("accepts a first revision", () => {
    expect(shouldAcceptRevision(null, 1)).toBe(true);
  });

  it("accepts equal revisions for idempotent retries", () => {
    expect(shouldAcceptRevision({ revision: 2 }, 2)).toBe(true);
  });

  it("accepts newer revisions", () => {
    expect(shouldAcceptRevision({ revision: 2 }, 3)).toBe(true);
  });

  it("rejects older revisions", () => {
    expect(shouldAcceptRevision({ revision: 2 }, 1)).toBe(false);
  });
});
