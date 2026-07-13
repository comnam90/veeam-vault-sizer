import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import type { ComputeRequirement } from "@/types/vault-sizer-api";

describe("InfrastructureTelemetry", () => {
  it("renders cores, RAM, and throughput when compute is present", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: { inboundMBps: 120, outboundMBps: 80 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
    expect(screen.getByText("Network Throughput")).toBeInTheDocument();
    expect(screen.getByText("120.0 / 80.0 MB/s")).toBeInTheDocument();
  });

  it("rounds raw floating-point throughput to one decimal place, matching StorageBreakdown's precision", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 8,
      networkThroughput: {
        inboundMBps: 10.922666666666666,
        outboundMBps: 5.461333333333333,
      },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("10.9 / 5.5 MB/s")).toBeInTheDocument();
  });

  it("renders a real 0 throughput reading distinctly from an absent one", () => {
    const compute: ComputeRequirement = {
      cores: 2,
      ram: 8,
      networkThroughput: { inboundMBps: 0, outboundMBps: 0 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("0.0 / 0.0 MB/s")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders — in every value cell, with all three rows present, when compute is undefined", () => {
    render(<InfrastructureTelemetry compute={undefined} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("Network Throughput")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("renders — for throughput specifically when networkThroughput is null but compute exists", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: null,
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
