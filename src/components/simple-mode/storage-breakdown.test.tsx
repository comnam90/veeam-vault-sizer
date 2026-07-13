import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorageBreakdown } from "./storage-breakdown";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

function makeData(
  volumes: { diskGB: number; diskPurpose: number }[],
): CVmAgentReturnObject {
  return {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: {
      compute: {
        cores: 2,
        ram: 8,
        volumes,
      },
    },
  };
}

describe("StorageBreakdown", () => {
  it("renders the grand total as — with no tier rows when data is null", () => {
    render(<StorageBreakdown data={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });

  it("renders only the Performance tier when only its volume is present, matching the grand total", () => {
    const data = makeData([{ diskGB: 2048, diskPurpose: 3 }]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    // Grand total and the single tier row both read "2.0 TB" here.
    expect(screen.getAllByText("2.0 TB")).toHaveLength(2);
    // The bar actually reflects its value to Radix, not just visually via
    // the indicator's inline transform (a real bug caught in prototyping:
    // forgetting to forward `value` to ProgressPrimitive.Root left every
    // bar stuck at data-state="indeterminate").
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "data-state",
      "complete",
    );
  });

  it("renders the Performance tier when its volume uses diskPurpose 2 (RepoLocal, e.g. Hardened Repository)", () => {
    const data = makeData([{ diskGB: 33310.72, diskPurpose: 2 }]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getAllByText("32.5 TB")).toHaveLength(2);
  });

  it("renders all three tiers present in volumes[] and sums them into the grand total", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 }, // 2.0 TB
      { diskGB: 4096, diskPurpose: 13 }, // 4.0 TB
      { diskGB: 1024, diskPurpose: 4 }, // 1.0 TB
    ]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("7.0 TB")).toBeInTheDocument(); // grand total
  });

  it("gives each bar its own proportional percentage of the grand total, not an equal split", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 }, // 2 TB of 7 TB => ~28.57%
      { diskGB: 4096, diskPurpose: 13 }, // 4 TB of 7 TB => ~57.14%
      { diskGB: 1024, diskPurpose: 4 }, // 1 TB of 7 TB => ~14.29%
    ]);
    render(<StorageBreakdown data={data} />);

    // Rendered in TIERS order: Performance, Capacity, Archive.
    const [performanceBar, capacityBar, archiveBar] =
      screen.getAllByRole("progressbar");

    expect(Number(performanceBar.getAttribute("aria-valuenow"))).toBeCloseTo(
      (2 / 7) * 100,
      5,
    );
    expect(Number(capacityBar.getAttribute("aria-valuenow"))).toBeCloseTo(
      (4 / 7) * 100,
      5,
    );
    expect(Number(archiveBar.getAttribute("aria-valuenow"))).toBeCloseTo(
      (1 / 7) * 100,
      5,
    );
  });
});
