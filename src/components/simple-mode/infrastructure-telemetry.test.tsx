import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import type { ComputeRequirement } from "@/types/vault-sizer-api";

describe("InfrastructureTelemetry", () => {
  it("renders cores and RAM when compute is present", () => {
    const compute: ComputeRequirement = { cores: 4, ram: 16 };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
  });

  it("no longer renders a Network Throughput row — that moved to NetworkBandwidth", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: { inboundMBps: 120, outboundMBps: 80 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.queryByText("Network Throughput")).not.toBeInTheDocument();
  });

  it("renders — in both value cells, with both rows present, when compute is undefined", () => {
    render(<InfrastructureTelemetry compute={undefined} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
