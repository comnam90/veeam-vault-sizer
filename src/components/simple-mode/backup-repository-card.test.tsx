import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupRepositoryCard } from "./backup-repository-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
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
  it("renders the Repository Configuration title", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(screen.getByText("Repository Configuration")).toBeInTheDocument();
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
        name: /secondary repository/i,
      }),
    ).toBeInTheDocument();
  });

  it("nests the target repository picker inside the Secondary block, not floating loose", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    const secondaryHeading = screen.getByRole("heading", {
      name: /secondary repository/i,
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

  it("shows the SOBR Design Block when SOBR Builder is selected", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByRole("button", { name: "SOBR Builder" }));

    expect(
      screen.getByRole("heading", {
        name: /scale-out backup repository \(sobr\) design/i,
      }),
    ).toBeInTheDocument();
  });

  it("defaults SOBR Builder's Performance Tier to Vault Azure with no Capacity or Archive Tier added", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByRole("button", { name: "SOBR Builder" }));

    expect(
      screen.getByRole("button", { name: "Vault Azure", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add capacity tier/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add archive tier/i }),
    ).toBeInTheDocument();
  });

  it("shows the target immutability field for a turnkey Vault choice (the default) and hides it for SOBR", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SOBR Builder" }));

    expect(
      screen.queryByLabelText(/target repository immutability period/i),
    ).not.toBeInTheDocument();

    const targetRepositoryGroup = screen.getByRole("group", {
      name: /select target repository/i,
    });
    await user.click(
      within(targetRepositoryGroup).getByRole("button", {
        name: "Vault Azure",
      }),
    );

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toBeInTheDocument();
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

  it("shows the target vault-retention message when the turnkey target's retention is under 30 days", () => {
    function LowRetentionHarness() {
      const [value, setValue] = useState<RepositoryConfigValues>({
        ...DEFAULT_REPOSITORY_CONFIG_VALUES,
        targetRepository: "vault-azure",
      });
      return (
        <BackupRepositoryCard
          value={value}
          workloadData={{
            ...DEFAULT_WORKLOAD_DATA_VALUES,
            shortTermRetentionDays: "10",
            gfsWeekly: "0",
            gfsMonthly: "0",
            gfsYearly: "0",
          }}
          onChange={setValue}
        />
      );
    }
    render(<LowRetentionHarness />);

    expect(
      screen.getByText(/would only remain on this vault azure repository/i),
    ).toBeInTheDocument();
  });

  it("shows the primary vault-retention message when Primary's retention is under 30 days in Copy mode", () => {
    function LowPrimaryRetentionHarness() {
      const [value, setValue] = useState<RepositoryConfigValues>({
        ...DEFAULT_REPOSITORY_CONFIG_VALUES,
        backupPath: "copy",
        primary: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.primary,
          repoType: "vault-azure",
        },
      });
      return (
        <BackupRepositoryCard
          value={value}
          workloadData={{
            ...DEFAULT_WORKLOAD_DATA_VALUES,
            shortTermRetentionDays: "10",
            gfsWeekly: "0",
            gfsMonthly: "0",
            gfsYearly: "0",
          }}
          onChange={setValue}
        />
      );
    }
    render(<LowPrimaryRetentionHarness />);

    expect(
      screen.getByText(/would only remain on this vault primary repository/i),
    ).toBeInTheDocument();
  });

  describe("debounced vault-retention validation", () => {
    const sobrValues: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "direct",
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "vault-azure",
        performanceImmutableDays: "30",
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: false,
        },
        archiveTier: {
          enabled: true,
          moveDays: "60",
          immutableDays: "365",
          standaloneFullBackups: false,
        },
      },
    };
    const sobrWorkloadData: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      shortTermRetentionDays: "30",
      gfsWeekly: "4",
      gfsMonthly: "0",
      gfsYearly: "0",
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not flash the vault-retention error for a value that only briefly passes through an invalid intermediate", () => {
      const { rerender } = render(
        <BackupRepositoryCard
          value={sobrValues}
          workloadData={sobrWorkloadData}
          onChange={() => {}}
        />,
      );

      // Simulates typing "60" quickly into "Move GFS archives older than":
      // the "6" keystroke is briefly an invalid move-threshold on its own,
      // then "60" arrives moments later.
      act(() => {
        rerender(
          <BackupRepositoryCard
            value={{
              ...sobrValues,
              sobr: {
                ...sobrValues.sobr,
                archiveTier: { ...sobrValues.sobr.archiveTier, moveDays: "6" },
              },
            }}
            workloadData={sobrWorkloadData}
            onChange={() => {}}
          />,
        );
      });
      expect(
        screen.queryByText(/would only remain on this vault performance tier/i),
      ).not.toBeInTheDocument();

      act(() => {
        rerender(
          <BackupRepositoryCard
            value={sobrValues}
            workloadData={sobrWorkloadData}
            onChange={() => {}}
          />,
        );
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(
        screen.queryByText(/would only remain on this vault performance tier/i),
      ).not.toBeInTheDocument();
    });

    it("still surfaces the vault-retention error once an invalid value settles for the full debounce delay", () => {
      const invalidValues: RepositoryConfigValues = {
        ...sobrValues,
        sobr: {
          ...sobrValues.sobr,
          archiveTier: { ...sobrValues.sobr.archiveTier, moveDays: "9" },
        },
      };

      const { rerender } = render(
        <BackupRepositoryCard
          value={sobrValues}
          workloadData={sobrWorkloadData}
          onChange={() => {}}
        />,
      );

      act(() => {
        rerender(
          <BackupRepositoryCard
            value={invalidValues}
            workloadData={sobrWorkloadData}
            onChange={() => {}}
          />,
        );
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(
        screen.getByText(/would only remain on this vault performance tier/i),
      ).toBeInTheDocument();
    });
  });
});
