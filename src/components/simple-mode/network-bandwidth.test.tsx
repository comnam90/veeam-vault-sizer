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
    expect(screen.getByText("10.9 / 5.5 MB/s")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Full / Restore (24h)"),
    ).toBeInTheDocument();
    expect(screen.getByText("121.4 / 60.7 MB/s")).toBeInTheDocument();
  });

  it("renders a real 0 throughput distinctly from an absent one", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={{ inboundMBps: 0, outboundMBps: 0 }}
        initialFullRestore={null}
      />,
    );

    expect(screen.getByText("0.0 / 0.0 MB/s")).toBeInTheDocument();
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
