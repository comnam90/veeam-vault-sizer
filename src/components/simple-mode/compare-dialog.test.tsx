import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareDialog } from "./compare-dialog";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CompareEntry } from "@/lib/simple-mode/compare-sizings";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const liveData: CVmAgentReturnObject = {
  totalStorageTB: 0,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: { cores: 4, ram: 16, volumes: [{ diskGB: 2048, diskPurpose: 3 }] },
  },
  proxyCompute: {
    compute: {
      cores: 8,
      ram: 32,
      networkThroughput: { inboundMBps: 100, outboundMBps: 50 },
    },
  },
};

const entries: CompareEntry[] = [
  {
    label: "Live",
    workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: { mode: "direct", data: liveData },
  },
  {
    label: "Snapshot 1",
    workloadData: { ...DEFAULT_WORKLOAD_DATA_VALUES, sourceSizeTB: "20" },
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: {
      mode: "direct",
      data: {
        ...liveData,
        repoCompute: {
          compute: {
            cores: 4,
            ram: 16,
            volumes: [{ diskGB: 4096, diskPurpose: 3 }],
          },
        },
      },
    },
  },
];

describe("CompareDialog", () => {
  it("does not render its content when closed", () => {
    render(
      <CompareDialog open={false} onOpenChange={() => {}} entries={entries} />,
    );
    expect(screen.queryByText("Compare Sizings")).not.toBeInTheDocument();
  });

  it("renders a column per entry and the Total Required Storage row when open", () => {
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    expect(screen.getByText("Compare Sizings")).toBeInTheDocument();

    // Scoped to the sizing table specifically: the Workload Data and
    // Repository Configuration sections each render their own
    // ComparisonTable too (mounted even while their <details> is closed —
    // jsdom doesn't hide collapsed-details content), so an unscoped
    // getByRole("columnheader", { name: "Live" }) would match 3 elements
    // and throw.
    const totalRow = screen.getByText("Total Required Storage").closest("tr");
    expect(totalRow).not.toBeNull();
    const sizingTable = totalRow!.closest("table");
    expect(sizingTable).not.toBeNull();
    expect(
      within(sizingTable!).getByRole("columnheader", { name: "Live" }),
    ).toBeInTheDocument();
    expect(
      within(sizingTable!).getByRole("columnheader", { name: "Snapshot 1" }),
    ).toBeInTheDocument();
    expect(within(totalRow!).getByText("2.0 TB")).toBeInTheDocument();
    expect(within(totalRow!).getByText("4.0 TB")).toBeInTheDocument();
  });

  it("renders the Workload Data and Repository Configuration sections collapsed by default", () => {
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    const workloadDetails = screen
      .getByText("Workload Data")
      .closest("details");
    const repoDetails = screen
      .getByText("Repository Configuration")
      .closest("details");
    expect(workloadDetails).not.toBeNull();
    expect(repoDetails).not.toBeNull();
    expect(workloadDetails).not.toHaveAttribute("open");
    expect(repoDetails).not.toHaveAttribute("open");
  });

  it("reveals Workload Data rows once expanded", async () => {
    const user = userEvent.setup();
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    await user.click(screen.getByText("Workload Data"));

    const sourceSizeRow = screen.getByText("Source Size (TB)").closest("tr");
    expect(sourceSizeRow).not.toBeNull();
    expect(within(sourceSizeRow!).getByText("10")).toBeInTheDocument();
    expect(within(sourceSizeRow!).getByText("20")).toBeInTheDocument();
  });
});
