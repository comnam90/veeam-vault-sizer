import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupRepositoryCard } from "./backup-repository-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
} from "@/types/simple-mode";

function Harness({ initial }: { initial: RepositoryConfigValues }) {
  const [value, setValue] = useState(initial);
  return (
    <BackupRepositoryCard
      value={value}
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      onChange={setValue}
    />
  );
}

describe("BackupRepositoryCard", () => {
  it("renders the Vault Configuration title", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(screen.getByText("Vault Configuration")).toBeInTheDocument();
  });

  it("does not show the Primary Repository track in Direct mode", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.queryByRole("heading", { name: /primary repository/i }),
    ).not.toBeInTheDocument();
  });

  it("stacks the Primary track above the Secondary block when switching to Backup Copy", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    expect(
      screen.getByRole("heading", { name: /primary repository/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /secondary vault\/cloud repository/i,
      }),
    ).toBeInTheDocument();
  });

  it("nests the target repository picker inside the Secondary block, not floating loose", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    const secondaryHeading = screen.getByRole("heading", {
      name: /secondary vault\/cloud repository/i,
    });
    const secondaryBlock = within(
      secondaryHeading.parentElement as HTMLElement,
    );

    expect(
      secondaryBlock.getByText(/select target repository/i),
    ).toBeInTheDocument();
    expect(
      secondaryBlock.getByText(/customize copy retention/i),
    ).toBeInTheDocument();
  });

  it("shows the SOBR Design Block when SOBR Builder is selected (the default)", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.getByRole("heading", {
        name: /scale-out backup repository \(sobr\) design/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the target immutability field for a turnkey Vault choice and hides it for SOBR", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.queryByLabelText(/target repository immutability period/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vault Azure" }));

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SOBR Builder" }));

    expect(
      screen.queryByLabelText(/target repository immutability period/i),
    ).not.toBeInTheDocument();
  });

  it("shows an inline error on the target immutability field", () => {
    render(
      <Harness
        initial={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          targetRepository: "vault-azure",
          targetRepositoryImmutableDays: "0",
        }}
      />,
    );

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be 1 or greater")).toBeInTheDocument();
  });
});
