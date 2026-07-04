import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkloadDataCard } from "./workload-data-card";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

describe("WorkloadDataCard", () => {
  it("renders all fields with their default values", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/source data size/i)).toHaveValue("10");
    expect(screen.getByLabelText(/daily change rate/i)).toHaveValue("3");
    expect(screen.getByLabelText(/data reduction/i)).toHaveValue("50");
    expect(screen.getByLabelText(/yearly growth/i)).toHaveValue("10");
    expect(screen.getByLabelText(/short-term retention/i)).toHaveValue("30");
    expect(screen.getByLabelText(/gfs points weekly/i)).toHaveValue("4");
    expect(screen.getByLabelText(/gfs points monthly/i)).toHaveValue("12");
    expect(screen.getByLabelText(/gfs points yearly/i)).toHaveValue("3");
  });

  it("shows the Default 50% hint under Data Reduction", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Default 50%")).toBeInTheDocument();
  });

  it("shows the GFS mini-labels beneath each box", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    // The mini-labels are stored as "Weekly"/"Monthly"/"Yearly" and rendered
    // uppercase via CSS `text-transform` only — the DOM text content stays
    // mixed-case, so the assertions must be case-insensitive.
    expect(screen.getByText(/^weekly$/i)).toBeInTheDocument();
    expect(screen.getByText(/^monthly$/i)).toBeInTheDocument();
    expect(screen.getByText(/^yearly$/i)).toBeInTheDocument();
  });

  it("calls onChange with the updated value when a field is edited", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    // WorkloadDataCard is a controlled component: its <Input> value is bound
    // directly to the `value` prop, so a plain `vi.fn()` onChange (which never
    // feeds a new value back in) would make React reset the DOM's displayed
    // value after every keystroke, corrupting multi-character `user.type()`
    // input. This harness mirrors how SimpleModePage actually uses the card
    // (state lives in the parent, onChange updates it) so typing behaves as
    // a real controlled input would.
    function Harness() {
      const [value, setValue] = useState<WorkloadDataValues>(
        DEFAULT_WORKLOAD_DATA_VALUES,
      );
      return (
        <WorkloadDataCard
          value={value}
          onChange={(next) => {
            setValue(next);
            handleChange(next);
          }}
        />
      );
    }
    render(<Harness />);

    const sourceSize = screen.getByLabelText(/source data size/i);
    await user.clear(sourceSize);
    await user.type(sourceSize, "20");

    const lastCall = handleChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ sourceSizeTB: "20" });
  });

  it("shows an inline error and aria-invalid when a value is out of range", () => {
    render(
      <WorkloadDataCard
        value={{
          ...DEFAULT_WORKLOAD_DATA_VALUES,
          dataReductionPercent: "150",
        }}
        onChange={vi.fn()}
      />,
    );

    const field = screen.getByLabelText(/data reduction/i);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be between 0 and 100")).toBeInTheDocument();
  });

  it("clears the error once the value is corrected", () => {
    const { rerender } = render(
      <WorkloadDataCard
        value={{
          ...DEFAULT_WORKLOAD_DATA_VALUES,
          dataReductionPercent: "150",
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Must be between 0 and 100")).toBeInTheDocument();

    rerender(
      <WorkloadDataCard
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, dataReductionPercent: "50" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Must be between 0 and 100"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/data reduction/i)).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("shows an inline error on an individual GFS box", () => {
    render(
      <WorkloadDataCard
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, gfsMonthly: "-1" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/gfs points monthly/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Must be 0 or greater")).toBeInTheDocument();
  });
});
