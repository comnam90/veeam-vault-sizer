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
  it("renders the title, badge, storage tier, proxy compute, and nightly bandwidth", () => {
    render(
      <SiteSizingSection
        title="Primary — On-Premises Landing Zone"
        badge="Hardened Repository"
        data={siteData}
        initialFullRestore={{ inboundMBps: 200, outboundMBps: 100 }}
      />,
    );

    expect(
      screen.getByText("Primary — On-Premises Landing Zone"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hardened Repository")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();

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
});
