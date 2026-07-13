import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  beforeEach(() => {
    // ProjectedSizingCard's useCalculatedSizing dispatches a real fetch on
    // mount; stub it so these tests don't hit the network.
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
});
