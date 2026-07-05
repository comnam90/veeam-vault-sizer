import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SobrBuilder } from "./sobr-builder";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  type SobrConfig,
} from "@/types/simple-mode";

const defaultSobr = DEFAULT_REPOSITORY_CONFIG_VALUES.sobr;

describe("SobrBuilder", () => {
  it("hides the Performance Tier immutability field when the type does not require it", () => {
    render(<SobrBuilder value={defaultSobr} onChange={vi.fn()} />);

    expect(
      screen.queryByLabelText(/performance tier immutability period/i),
    ).not.toBeInTheDocument();
  });

  it("shows the Performance Tier immutability field when the type requires it", () => {
    render(
      <SobrBuilder
        value={{ ...defaultSobr, performanceType: "vault-azure" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/performance tier immutability period/i),
    ).toBeInTheDocument();
  });

  it("always shows the Capacity Tier immutability field when enabled, regardless of type", () => {
    render(<SobrBuilder value={defaultSobr} onChange={vi.fn()} />);

    expect(
      screen.getByLabelText(/capacity tier immutability period/i),
    ).toBeInTheDocument();
  });

  it("allows adding Archive Tier while Capacity Tier is disabled", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>({
        ...defaultSobr,
        capacityTier: { ...defaultSobr.capacityTier, enabled: false },
      });
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByLabelText(/move gfs archives older than/i),
    ).toBeInTheDocument();
  });

  it("toggles Copy and Move policies independently", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<SobrBuilder value={defaultSobr} onChange={handleChange} />);

    await user.click(screen.getByLabelText(/copy backups immediately/i));

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityTier: expect.objectContaining({
          copyPolicy: true,
          movePolicy: true,
        }),
      }),
    );
  });

  it("shows the standalone-full-backups checkbox once Archive Tier is added", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>(defaultSobr);
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByLabelText(/standalone full backups/i),
    ).toBeInTheDocument();
  });
});
