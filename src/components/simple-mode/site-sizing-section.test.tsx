import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SiteSizingSection } from "./site-sizing-section";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const siteData: CVmAgentReturnObject = {
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

describe("SiteSizingSection", () => {
  it("renders the title, per-tier label, proxy compute, and nightly bandwidth", () => {
    render(
      <SiteSizingSection
        title="Primary Repository"
        tierLabels={{ performance: "Hardened Repository" }}
        data={siteData}
        initialFullRestore={{ inboundMBps: 200, outboundMBps: 100 }}
      />,
    );

    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    expect(
      screen.getByText("Performance — Hardened Repository"),
    ).toBeInTheDocument();

    // Proxy compute reads proxyCompute (8 / 32 GB), not repoCompute (4 / 16).
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("32 GB")).toBeInTheDocument();

    // Nightly incremental row shows proxyCompute's outbound (50 MB/s × 8 = 400).
    const nightlyRow = screen
      .getByText("Nightly Incremental (8h)")
      .closest("tr");
    expect(nightlyRow).not.toBeNull();
    expect(within(nightlyRow!).getByText("400.0 Mbps")).toBeInTheDocument();
  });

  it("renders the placeholder state without throwing when data is null", () => {
    render(
      <SiteSizingSection
        title="Primary Repository"
        tierLabels={{ performance: "Vault Azure" }}
        data={null}
        initialFullRestore={null}
      />,
    );

    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    // Multiple placeholders render "—" when data is null: StorageBreakdown's
    // total, InfrastructureTelemetry's Cores/RAM, and NetworkBandwidth's two
    // rows — so assert at least one exists rather than a single unique match.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Performance/)).not.toBeInTheDocument();
  });
});
