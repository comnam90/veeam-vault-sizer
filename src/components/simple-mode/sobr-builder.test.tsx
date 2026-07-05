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

  it("shows the standalone-full-backups switch once Archive Tier is added", async () => {
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

  it("collapses Capacity Tier to a ghost block when disabled, matching Archive Tier's pattern", () => {
    render(
      <SobrBuilder
        value={{
          ...defaultSobr,
          capacityTier: { ...defaultSobr.capacityTier, enabled: false },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /add capacity tier/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/copy backups immediately/i),
    ).not.toBeInTheDocument();
  });

  it("expands Capacity Tier via + Add Capacity Tier, and collapses it again via Remove", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>({
        ...defaultSobr,
        capacityTier: { ...defaultSobr.capacityTier, enabled: false },
      });
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: /add capacity tier/i }),
    );
    expect(
      screen.getByLabelText(/copy backups immediately/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(
      screen.queryByLabelText(/copy backups immediately/i),
    ).not.toBeInTheDocument();
  });

  it("renders Capacity Tier's Copy/Move policies and Archive Tier's standalone option as switches, not checkboxes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>(defaultSobr);
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByRole("switch", { name: /copy backups immediately/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /move backups older than/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /standalone full backups/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
