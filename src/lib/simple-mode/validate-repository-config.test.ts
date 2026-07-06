import { describe, expect, it } from "vitest";
import { validateRepositoryConfig } from "./validate-repository-config";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
} from "@/types/simple-mode";

// A fully valid, fully-enabled configuration: Backup Copy mode, SOBR target,
// Capacity Tier and Archive Tier both enabled, every retention override on.
// This exercises every validated field at once for the "no errors" baseline;
// individual tests below flip one field/trigger at a time.
//
// Performance Tier is Hardened Repository (not a Vault type) and Primary's
// retention is 30 days — both deliberate choices so this fixture also
// passes the Vault minimum-retention check added in a later task, not just
// the pre-existing field-level checks.
const validSobrValues: RepositoryConfigValues = {
  backupPath: "copy",
  targetRepository: "sobr",
  targetRepositoryImmutableDays: "30",
  sobr: {
    performanceType: "hardened-repository",
    performanceImmutableDays: "30",
    capacityTier: {
      enabled: true,
      type: "s3-compatible",
      copyPolicy: false,
      movePolicy: true,
      moveDays: "14",
      immutableDays: "30",
    },
    archiveTier: {
      enabled: true,
      moveDays: "90",
      immutableDays: "365",
      standaloneFullBackups: false,
    },
  },
  primary: {
    repoType: "vault-aws",
    immutableDays: "30",
    retention: {
      customizeRetention: true,
      retentionDays: "30",
      gfsWeekly: "0",
      gfsMonthly: "0",
      gfsYearly: "0",
    },
  },
  secondaryRetention: {
    customizeRetention: true,
    retentionDays: "30",
    gfsWeekly: "4",
    gfsMonthly: "12",
    gfsYearly: "3",
  },
};

describe("validateRepositoryConfig", () => {
  it("returns no errors for a fully valid, fully-enabled configuration", () => {
    expect(
      validateRepositoryConfig(validSobrValues, DEFAULT_WORKLOAD_DATA_VALUES),
    ).toEqual({});
  });

  describe("targetRepositoryImmutableDays", () => {
    const turnkeyValues: RepositoryConfigValues = {
      ...validSobrValues,
      targetRepository: "vault-azure",
    };

    it("is not validated when targetRepository is 'sobr'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            targetRepositoryImmutableDays: "",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBeUndefined();
    });

    it("requires a value for a turnkey Vault choice", () => {
      expect(
        validateRepositoryConfig(
          {
            ...turnkeyValues,
            targetRepositoryImmutableDays: "",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBe("Required");
    });

    it("rejects 0", () => {
      expect(
        validateRepositoryConfig(
          {
            ...turnkeyValues,
            targetRepositoryImmutableDays: "0",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBe("Must be 1 or greater");
    });

    it("accepts a valid value", () => {
      expect(
        validateRepositoryConfig(turnkeyValues, DEFAULT_WORKLOAD_DATA_VALUES)
          .targetRepositoryImmutableDays,
      ).toBeUndefined();
    });
  });

  describe("primary (Backup Copy mode)", () => {
    it("clears all primary errors when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            backupPath: "direct",
            primary: {
              ...validSobrValues.primary,
              immutableDays: "",
              retention: {
                ...validSobrValues.primary.retention,
                retentionDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("requires immutableDays when repoType requires immutability", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: { ...validSobrValues.primary, immutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.immutableDays,
      ).toBe("Required");
    });

    it("does not require immutableDays when repoType does not require it", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              repoType: "refs-xfs",
              immutableDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                ...validSobrValues.primary.retention,
                retentionDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.retention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not validate retention fields when customizeRetention is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                customizeRetention: false,
                retentionDays: "",
                gfsWeekly: "",
                gfsMonthly: "",
                gfsYearly: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                ...validSobrValues.primary.retention,
                gfsWeekly: "-1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.retention?.gfsWeekly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("secondaryRetention (Backup Copy mode)", () => {
    it("is not validated when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            backupPath: "direct",
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              retentionDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              retentionDays: "0",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              gfsMonthly: "-1",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention?.gfsMonthly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("sobr.performanceImmutableDays", () => {
    it("is not validated when targetRepository is not 'sobr'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            targetRepository: "vault-azure",
            sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr,
      ).toBeUndefined();
    });

    it("requires a value when performanceType requires immutability", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.performanceImmutableDays,
      ).toBe("Required");
    });

    it("does not require a value when performanceType does not require it", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "nas",
              performanceImmutableDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr,
      ).toBeUndefined();
    });
  });

  describe("sobr.capacityTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
                moveDays: "",
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1 when movePolicy is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                moveDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not require moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                movePolicy: false,
                moveDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays unconditionally on type, whenever enabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.immutableDays,
      ).toBe("Required");
    });

    it("allows both copyPolicy and movePolicy unchecked (explicitly permissive)", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                copyPolicy: false,
                movePolicy: false,
                moveDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier,
      ).toBeUndefined();
    });
  });

  describe("sobr.archiveTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                enabled: false,
                moveDays: "",
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("is independent of capacityTier being disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("requires moveDays greater than capacityTier.moveDays when capacity-move is active", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "14",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBe("Must be greater than 14");
    });

    it("does not compare against capacityTier.moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                movePolicy: false,
              },
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("does not compare against capacityTier.moveDays when capacityTier is disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.immutableDays,
      ).toBe("Required");
    });

    it("requires the Performance Tier type to support feeding Archive Tier when Capacity Tier is disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "google-cloud",
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud doesn't support sending data directly to Archive Tier without a Capacity Tier in between. Add a Capacity Tier (with a non-Google-Cloud type), or change the Performance Tier repository type.",
      );
    });

    it("ignores Performance Tier's type once Capacity Tier is the tier feeding Archive Tier", () => {
      // Performance is Google Cloud, but Capacity Tier (s3-compatible, from
      // validSobrValues) is enabled and sits between Performance and Archive,
      // so Performance's type is irrelevant here. This is not "Google Cloud
      // is always fine once Capacity Tier exists" — it passes only because
      // the *Capacity Tier's* type supports feeding Archive Tier.
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "google-cloud",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBeUndefined();
    });

    it("requires the Capacity Tier type to support feeding Archive Tier when Capacity Tier is enabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                type: "google-cloud",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud Capacity Tier can't send data to Archive Tier. Change the Capacity Tier repository type.",
      );
    });
  });
});
