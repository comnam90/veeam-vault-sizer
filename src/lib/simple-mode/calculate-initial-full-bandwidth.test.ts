import { describe, expect, it } from "vitest";
import { calculateInitialFullBandwidth } from "./calculate-initial-full-bandwidth";

describe("calculateInitialFullBandwidth", () => {
  it("computes inbound/outbound MBps for a 10TB source at 50% reduction over the 24h window", () => {
    const result = calculateInitialFullBandwidth("10", "50");

    expect(result).not.toBeNull();
    expect(result?.inboundMBps).toBeCloseTo(121.36296, 4);
    expect(result?.outboundMBps).toBeCloseTo(60.68148, 4);
  });

  it("outbound equals inbound at 0% reduction (no dedup)", () => {
    const result = calculateInitialFullBandwidth("10", "0");

    expect(result?.inboundMBps).toBeCloseTo(121.36296, 4);
    expect(result?.outboundMBps).toBeCloseTo(121.36296, 4);
  });

  it("outbound is 0 at 100% reduction", () => {
    const result = calculateInitialFullBandwidth("10", "100");

    expect(result?.outboundMBps).toBe(0);
  });

  it("returns null for an empty sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("", "50")).toBeNull();
  });

  it("returns null for a non-numeric sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("abc", "50")).toBeNull();
  });

  it("returns null for a zero or negative sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("0", "50")).toBeNull();
    expect(calculateInitialFullBandwidth("-5", "50")).toBeNull();
  });

  it("returns null for a non-numeric dataReductionPercent", () => {
    expect(calculateInitialFullBandwidth("10", "abc")).toBeNull();
  });

  it("returns null for a dataReductionPercent out of the 0-100 range", () => {
    expect(calculateInitialFullBandwidth("10", "-1")).toBeNull();
    expect(calculateInitialFullBandwidth("10", "101")).toBeNull();
  });
});
