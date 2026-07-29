import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnapshotPanel } from "./snapshot-panel";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type Snapshot,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const sampleData: CVmAgentReturnObject = {
  totalStorageTB: 0,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: { cores: 4, ram: 16, volumes: [{ diskGB: 2048, diskPurpose: 3 }] },
  },
};

function makeSnapshot(id: string, label: string, diskGB: number): Snapshot {
  return {
    id,
    label,
    workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: {
      mode: "direct",
      data: {
        ...sampleData,
        repoCompute: {
          compute: { cores: 4, ram: 16, volumes: [{ diskGB, diskPurpose: 3 }] },
        },
      },
    },
  };
}

const live = {
  label: "Live",
  workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
  repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
  data: null,
};

describe("SnapshotPanel", () => {
  it("shows a placeholder message when there are no saved sizings", () => {
    render(
      <SnapshotPanel
        snapshots={[]}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/no saved sizings yet/i)).toBeInTheDocument();
  });

  it("renders one row per snapshot with its label and headline total", () => {
    const snapshots = [
      makeSnapshot("1", "Snapshot 1", 2048),
      makeSnapshot("2", "Snapshot 2", 4096),
    ];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("Snapshot 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Snapshot 2")).toBeInTheDocument();
    expect(screen.getByText("2.0 TB")).toBeInTheDocument();
    expect(screen.getByText("4.0 TB")).toBeInTheDocument();
  });

  it("caps selection at 2: a 3rd checkbox is disabled until one is unchecked", async () => {
    const user = userEvent.setup();
    const snapshots = [
      makeSnapshot("1", "Snapshot 1", 1024),
      makeSnapshot("2", "Snapshot 2", 2048),
      makeSnapshot("3", "Snapshot 3", 3072),
    ];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    expect(checkboxes[2]).toBeDisabled();

    await user.click(checkboxes[0]);
    expect(checkboxes[2]).toBeEnabled();
  });

  it("enables Compare selected only once at least one snapshot is checked, and opens the dialog on click", async () => {
    const user = userEvent.setup();
    const snapshots = [makeSnapshot("1", "Snapshot 1", 1024)];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    const compareButton = screen.getByRole("button", {
      name: /compare selected/i,
    });
    expect(compareButton).toBeDisabled();

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(compareButton).toBeEnabled();

    await user.click(compareButton);
    expect(screen.getByText("Compare Sizings")).toBeInTheDocument();
  });

  it("calls onDelete with the snapshot's id and removes it from the active selection", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const snapshots = [makeSnapshot("1", "Snapshot 1", 1024)];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(
      screen.getByRole("button", { name: /delete snapshot 1/i }),
    );

    expect(onDelete).toHaveBeenCalledWith("1");
    // Removing the only selected snapshot drops the selection count back to 0.
    expect(
      screen.getByRole("button", { name: /compare selected \(0\)/i }),
    ).toBeDisabled();
  });

  it("calls onRename as the label input is edited, using a stateful harness so multi-character typing works (ADR-0005)", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    function Harness() {
      const [snapshots, setSnapshots] = useState<Snapshot[]>([
        makeSnapshot("1", "Snapshot 1", 1024),
      ]);
      return (
        <SnapshotPanel
          snapshots={snapshots}
          live={live}
          onRename={(id, label) => {
            onRename(id, label);
            setSnapshots((prev) =>
              prev.map((s) => (s.id === id ? { ...s, label } : s)),
            );
          }}
          onDelete={() => {}}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByDisplayValue("Snapshot 1");
    await user.clear(input);
    await user.type(input, "Baseline");

    expect(screen.getByDisplayValue("Baseline")).toBeInTheDocument();
    expect(onRename).toHaveBeenLastCalledWith("1", "Baseline");
  });
});
