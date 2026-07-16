import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkBandwidth } from "./network-bandwidth";

describe("NetworkBandwidth", () => {
  it("renders both rows with their window captions and formatted values", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={{
          inboundMBps: 10.92266667,
          outboundMBps: 5.46133333,
        }}
        initialFullRestore={{
          inboundMBps: 121.36296296,
          outboundMBps: 60.68148148,
        }}
      />,
    );

    expect(screen.getByText("Nightly Incremental (8h)")).toBeInTheDocument();
    expect(screen.getByText("43.7 Mbps")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Full / Restore (24h)"),
    ).toBeInTheDocument();
    expect(screen.getByText("485.5 Mbps")).toBeInTheDocument();
  });

  it("renders a real 0 throughput distinctly from an absent one", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={{ inboundMBps: 0, outboundMBps: 0 }}
        initialFullRestore={null}
      />,
    );

    expect(screen.getByText("0.0 Mbps")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("renders — in both value cells, with both rows present, when both props are absent", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={undefined}
        initialFullRestore={undefined}
      />,
    );

    expect(screen.getByText("Nightly Incremental (8h)")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Full / Restore (24h)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
