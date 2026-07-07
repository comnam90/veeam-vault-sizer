import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetentionOverrideBlock } from "./retention-override-block";
import {
  DEFAULT_RETENTION_OVERRIDE,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RetentionOverride,
} from "@/types/simple-mode";

describe("RetentionOverrideBlock", () => {
  it("shows the inherited display computed from workloadData when unchecked", () => {
    render(
      <RetentionOverrideBlock
        context="Primary"
        checkboxLabel="Customize retention"
        value={DEFAULT_RETENTION_OVERRIDE}
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/retaining 30 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toBeInTheDocument();
  });

  it("reveals the retention grid, pre-seeded from workloadData, when checked", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RetentionOverride>(
        DEFAULT_RETENTION_OVERRIDE,
      );
      return (
        <RetentionOverrideBlock
          context="Primary"
          checkboxLabel="Customize retention"
          value={value}
          workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText(/customize retention/i));

    expect(screen.getByLabelText(/primary retention \(days\)/i)).toHaveValue(
      "30",
    );
    expect(screen.getByLabelText(/primary gfs weekly/i)).toHaveValue("4");
  });

  it("unchecking hides the grid without clearing the underlying value", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RetentionOverride>({
        customizeRetention: true,
        retentionDays: "45",
        gfsWeekly: "2",
        gfsMonthly: "6",
        gfsYearly: "1",
      });
      return (
        <RetentionOverrideBlock
          context="Primary"
          checkboxLabel="Customize retention"
          value={value}
          workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText(/customize retention/i));

    expect(
      screen.queryByLabelText(/primary retention \(days\)/i),
    ).not.toBeInTheDocument();

    // Re-checking re-seeds from workloadData rather than restoring "45" —
    // the override always starts from whatever Workload Data currently is.
    await user.click(screen.getByLabelText(/customize retention/i));

    expect(screen.getByLabelText(/primary retention \(days\)/i)).toHaveValue(
      "30",
    );
  });

  it("shows a validation error on an individual field", () => {
    render(
      <RetentionOverrideBlock
        context="Secondary"
        checkboxLabel="Customize copy retention"
        value={{
          customizeRetention: true,
          retentionDays: "0",
          gfsWeekly: "4",
          gfsMonthly: "12",
          gfsYearly: "3",
        }}
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        errors={{ retentionDays: "Must be 1 or greater" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/secondary retention \(days\)/i),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be 1 or greater")).toBeInTheDocument();
  });
});
