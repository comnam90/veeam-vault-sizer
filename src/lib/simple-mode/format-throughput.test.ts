import { describe, expect, it } from "vitest";
import { formatThroughputMbps } from "./format-throughput";

describe("formatThroughputMbps", () => {
  it("converts outbound MBps to Mbps, treating MB and Mb as equal magnitude", () => {
    expect(formatThroughputMbps({ inboundMBps: 100, outboundMBps: 50 })).toBe(
      "400.0 Mbps",
    );
  });

  it("rounds to one decimal place", () => {
    expect(formatThroughputMbps({ inboundMBps: 10, outboundMBps: 60.72 })).toBe(
      "485.8 Mbps",
    );
  });
});
