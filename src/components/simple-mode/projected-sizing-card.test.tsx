import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("ProjectedSizingCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders both ghost placeholders", () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: mockData }),
    );

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByTestId("projected-sizing-assumptions-placeholder"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("projected-sizing-actions-placeholder"),
    ).toBeInTheDocument();
  });

  it("shows a loading indicator while the initial request is in flight", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Recalculating")).toBeInTheDocument();
  });

  it("shows the error banner and keeps last-good data visible beneath it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: mockData }))
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Upstream sizing API unreachable" },
          502,
        ),
      );

    const { rerender } = render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0),
    );

    const edited = { ...DEFAULT_WORKLOAD_DATA_VALUES, sourceSizeTB: "11" };
    act(() => {
      rerender(
        <ProjectedSizingCard
          workloadData={edited}
          repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
          onChange={() => {}}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Upstream sizing API unreachable",
      ),
    );
    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
  });
});
