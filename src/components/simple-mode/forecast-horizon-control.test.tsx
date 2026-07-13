import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

describe("ForecastHorizonControl", () => {
  it("renders the slider thumb reflecting the in-range default value", () => {
    render(
      <ForecastHorizonControl
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("gives the slider its own accessible name, distinct from the input's", () => {
    render(
      <ForecastHorizonControl
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("slider", { name: "Forecast Horizon slider" }),
    ).toBeInTheDocument();
  });

  it("clamps the slider's displayed position for an out-of-range raw value, while the input keeps the raw value", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "10" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByLabelText(/forecast horizon \(years\)/i)).toHaveValue(
      "10",
    );
  });

  it("clamps to the minimum for an empty raw value without throwing", () => {
    expect(() =>
      render(
        <ForecastHorizonControl
          value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "" }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("clamps to the minimum for a genuinely non-numeric raw value without throwing", () => {
    expect(() =>
      render(
        <ForecastHorizonControl
          value={{
            ...DEFAULT_WORKLOAD_DATA_VALUES,
            projectLengthYears: "abc",
          }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("updates projectLengthYears when the input is edited", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    // Controlled input: a plain vi.fn() onChange never feeds a new value
    // back in, so React would reset the DOM value after every keystroke
    // (ADR-0005). This harness mirrors how ProjectedSizingCard actually
    // uses this control (state lives in the parent).
    function Harness() {
      const [value, setValue] = useState<WorkloadDataValues>(
        DEFAULT_WORKLOAD_DATA_VALUES,
      );
      return (
        <ForecastHorizonControl
          value={value}
          onChange={(next) => {
            setValue(next);
            handleChange(next);
          }}
        />
      );
    }
    render(<Harness />);

    const input = screen.getByLabelText(/forecast horizon \(years\)/i);
    await user.clear(input);
    await user.type(input, "7");

    const lastCall = handleChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ projectLengthYears: "7" });
  });

  it("renders an inline error for an invalid raw value", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "0" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Must be between 1 and 100")).toBeInTheDocument();
  });

  it("shows no error for a valid raw value that still pins the slider display", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "42" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "5");
    expect(screen.queryByText(/must be/i)).not.toBeInTheDocument();
  });
});
