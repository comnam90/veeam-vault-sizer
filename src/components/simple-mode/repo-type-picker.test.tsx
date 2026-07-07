import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepoTypePicker } from "./repo-type-picker";
import {
  ALL_REPO_TYPES,
  CAPACITY_TIER_TYPES,
  type RepoType,
} from "@/types/simple-mode";

describe("RepoTypePicker", () => {
  it("renders only categories present in allowedTypes", () => {
    render(
      <RepoTypePicker
        value="s3-compatible"
        allowedTypes={CAPACITY_TIER_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Vault" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Object Storage" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Block / File" }),
    ).not.toBeInTheDocument();
  });

  it("defaults the active category to the one containing the current value", () => {
    render(
      <RepoTypePicker
        value="vault-aws"
        allowedTypes={ALL_REPO_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Vault Azure" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Windows / Linux (ReFS / XFS)" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a category switches the visible type row", async () => {
    const user = userEvent.setup();
    render(
      <RepoTypePicker
        value="vault-azure"
        allowedTypes={ALL_REPO_TYPES}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Object Storage" }));

    expect(
      screen.getByRole("button", { name: "S3 Compatible" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vault Azure" }),
    ).not.toBeInTheDocument();
  });

  it("calls onChange with the selected type", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RepoTypePicker
        value="vault-azure"
        allowedTypes={ALL_REPO_TYPES}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Vault AWS" }));

    expect(handleChange).toHaveBeenCalledWith("vault-aws");
  });

  it("re-syncs to the new category when the parent overwrites value across categories", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RepoType>("refs-xfs");
      return (
        <>
          <RepoTypePicker
            value={value}
            allowedTypes={ALL_REPO_TYPES}
            onChange={setValue}
          />
          {/* Simulates a parent that reassigns `value` by some means other
              than this picker's own onChange — a reset button, a preset
              switch, etc. A controlled component must reflect its `value`
              prop regardless of how the parent changes it. */}
          <button type="button" onClick={() => setValue("s3-compatible")}>
            Simulate external overwrite
          </button>
        </>
      );
    }
    render(<Harness />);

    expect(
      screen.getByRole("button", { name: "Windows / Linux (ReFS / XFS)" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Simulate external overwrite" }),
    );

    expect(
      screen.queryByRole("button", { name: "Windows / Linux (ReFS / XFS)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "S3 Compatible" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
