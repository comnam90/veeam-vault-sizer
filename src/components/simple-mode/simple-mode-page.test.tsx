import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  beforeEach(() => {
    // SimpleModePage's useCalculatedSizing dispatches a real fetch on mount;
    // stub it so these tests don't hit the network.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Workload Data card, the Repository Configuration card, and the Projected Sizing card", () => {
    render(<SimpleModePage />);

    expect(screen.getByText("Workload Data")).toBeInTheDocument();
    expect(screen.getByText("Repository Configuration")).toBeInTheDocument();
    expect(screen.getByText("Projected Sizing")).toBeInTheDocument();
  });

  it("threads live workloadData from WorkloadDataCard into BackupRepositoryCard's retention inheritance", async () => {
    const user = userEvent.setup();
    render(<SimpleModePage />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    // Both Primary and Secondary default to mirroring Workload Data.
    expect(
      screen.getAllByText(/retaining 30 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toHaveLength(2);

    const retentionInput = screen.getByLabelText(
      /short-term retention \(days\)/i,
    );
    await user.clear(retentionInput);
    await user.type(retentionInput, "45");

    // Editing Workload Data must flow through the real `workloadData` prop
    // (not a stale default) into both inherited-retention summaries at once.
    expect(
      screen.getAllByText(/retaining 45 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toHaveLength(2);
  });

  it("creates a new snapshot labeled Snapshot 1 when Snapshot current sizing is clicked, once data has loaded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              mode: "direct",
              data: {
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
              },
            }),
          ),
        ),
      ),
    );

    render(<SimpleModePage />);

    const snapshotButton = await screen.findByRole("button", {
      name: /snapshot current sizing/i,
    });
    await vi.waitFor(() => expect(snapshotButton).toBeEnabled());
    await user.click(snapshotButton);

    const labelInput = screen.getByDisplayValue("Snapshot 1");
    const row = labelInput.closest("li");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();
  });

  it("keeps a snapshot's stored values unchanged after the live form is edited further", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              mode: "direct",
              data: {
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
              },
            }),
          ),
        ),
      ),
    );

    render(<SimpleModePage />);

    const snapshotButton = await screen.findByRole("button", {
      name: /snapshot current sizing/i,
    });
    await vi.waitFor(() => expect(snapshotButton).toBeEnabled());
    await user.click(snapshotButton);

    const labelInput = screen.getByDisplayValue("Snapshot 1");
    const row = labelInput.closest("li");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();

    const sourceSizeInput = screen.getByLabelText(/source data size/i);
    await user.clear(sourceSizeInput);
    await user.type(sourceSizeInput, "999");

    // The saved snapshot's own row must still read the value it was captured
    // with, unaffected by the live form's subsequent edit — proof that
    // setWorkloadData's new object doesn't retroactively change the
    // reference already stored on the snapshot.
    expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();
  });
});
