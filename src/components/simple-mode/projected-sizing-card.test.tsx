import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectedSizingCard } from "./projected-sizing-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: {
      cores: 4,
      ram: 16,
      volumes: [{ diskGB: 18841, diskPurpose: 3 }],
    },
  },
  // Deliberately distinct from repoCompute's cores/ram above: proves
  // InfrastructureTelemetry reads proxyCompute (proxy sizing), not
  // repoCompute (repository storage volumes) — a swap between the two
  // is type-compatible and wouldn't otherwise be caught by these tests.
  proxyCompute: {
    compute: {
      cores: 8,
      ram: 32,
      networkThroughput: { inboundMBps: 100, outboundMBps: 50 },
    },
  },
};

describe("ProjectedSizingCard", () => {
  it("renders the assumptions placeholder and the Snapshot current sizing action", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByTestId("projected-sizing-assumptions-placeholder"),
    ).toBeInTheDocument();
  });

  it("shows a loading indicator while isLoading is true", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={true}
        error={null}
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByLabelText("Recalculating")).toBeInTheDocument();
  });

  it("wires InfrastructureTelemetry to proxyCompute, not repoCompute", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("32 GB")).toBeInTheDocument();
  });

  it("labels the compute/network section as Proxy Compute, distinct from repo storage sizing above it", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByText("Proxy Compute")).toBeInTheDocument();
  });

  it("wires NetworkBandwidth to proxyCompute's networkThroughput and the derived initial full/restore figure", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    const nightlyRow = screen
      .getByText("Nightly Incremental (8h)")
      .closest("tr");
    expect(nightlyRow).not.toBeNull();
    expect(within(nightlyRow!).getByText("400.0 Mbps")).toBeInTheDocument();

    const initialFullRow = screen
      .getByText("Initial Full / Restore (24h)")
      .closest("tr");
    expect(initialFullRow).not.toBeNull();
    expect(within(initialFullRow!).getByText("485.5 Mbps")).toBeInTheDocument();
  });

  it("shows the error banner and keeps last-good data visible beneath it", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error="Upstream sizing API unreachable"
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upstream sizing API unreachable",
    );
    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
  });

  it("renders the split canvas with a combined total and both site sections in copy mode", () => {
    const primaryData: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 4,
          ram: 8,
          volumes: [{ diskGB: 24576, diskPurpose: 2 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 4,
          ram: 8,
          networkThroughput: { inboundMBps: 20, outboundMBps: 10 },
        },
      },
    };
    const secondaryData: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 4,
          volumes: [{ diskGB: 18841, diskPurpose: 3 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 2,
          ram: 4,
          networkThroughput: { inboundMBps: 8, outboundMBps: 4 },
        },
      },
    };

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          backupPath: "copy",
        }}
        data={{ mode: "copy", primary: primaryData, secondary: secondaryData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByText("Combined Required Storage")).toBeInTheDocument();
    expect(screen.getByText("42.4 TB")).toBeInTheDocument();
    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    expect(screen.getByText("Secondary Repository")).toBeInTheDocument();
    expect(
      screen.getByText("Performance — Hardened Repository"),
    ).toBeInTheDocument();
    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
    expect(
      screen.getByText("Primary 24.0 TB + Secondary 18.4 TB"),
    ).toBeInTheDocument();
  });

  it("derives the copy-mode subline's secondary figure as a residual of the rounded headline (D14), not its own independent rounding", () => {
    const primaryData: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 4,
          ram: 8,
          volumes: [{ diskGB: 3113, diskPurpose: 2 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 4,
          ram: 8,
          networkThroughput: { inboundMBps: 20, outboundMBps: 10 },
        },
      },
    };
    const secondaryData: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 4,
          volumes: [{ diskGB: 2089, diskPurpose: 3 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 2,
          ram: 4,
          networkThroughput: { inboundMBps: 8, outboundMBps: 4 },
        },
      },
    };

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          backupPath: "copy",
        }}
        data={{ mode: "copy", primary: primaryData, secondary: secondaryData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByText("5.1 TB")).toBeInTheDocument();
    expect(
      screen.getByText("Primary 3.0 TB + Secondary 2.1 TB"),
    ).toBeInTheDocument();
  });

  it("titles the direct-mode section Primary Repository with its target's tier label", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
  });

  it("renders the adjusted-threshold note when archiveTierNotice.status is adjusted", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{
          mode: "direct",
          data: mockData,
          archiveTierNotice: { status: "adjusted", effectiveThresholdDays: 30 },
        }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByText(/adjusted internally to 30 days/i),
    ).toBeInTheDocument();
  });

  it("renders the hard disclaimer when archiveTierNotice.status is failed", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{
          mode: "direct",
          data: mockData,
          archiveTierNotice: { status: "failed" },
        }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't be fully verified/i,
    );
  });

  it("renders no notice when archiveTierNotice is absent", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
    expect(screen.queryByText(/adjusted internally/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't be fully verified/i),
    ).not.toBeInTheDocument();
  });
});

describe("Snapshot current sizing button", () => {
  it("calls onSnapshot when clicked", async () => {
    const user = userEvent.setup();
    const onSnapshot = vi.fn();

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={onSnapshot}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("is disabled while isLoading is true", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={true}
        error={null}
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is disabled when error is set", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error="Upstream sizing API unreachable"
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is disabled when data is null (no successful calculation yet)", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={false}
        error={null}
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is enabled once data is present and there is no loading/error state", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={true}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeEnabled();
  });

  it("is disabled when canSnapshot is false, even with data present and no loading/error state (e.g. current form inputs are invalid)", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        canSnapshot={false}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });
});
