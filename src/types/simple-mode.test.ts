import { describe, expect, it } from "vitest";
import { DEFAULT_REPOSITORY_CONFIG_VALUES } from "./simple-mode";

describe("DEFAULT_REPOSITORY_CONFIG_VALUES.sobr", () => {
  it("defaults Performance Tier to Vault Azure with Capacity and Archive Tier both disabled", () => {
    const { sobr } = DEFAULT_REPOSITORY_CONFIG_VALUES;
    expect(sobr.performanceType).toBe("vault-azure");
    expect(sobr.capacityTier.enabled).toBe(false);
    expect(sobr.archiveTier.enabled).toBe(false);
  });

  it("defaults a re-added Capacity Tier to Vault Azure with Copy and Move both enabled and a 30-day move window", () => {
    const { capacityTier } = DEFAULT_REPOSITORY_CONFIG_VALUES.sobr;
    expect(capacityTier.type).toBe("vault-azure");
    expect(capacityTier.copyPolicy).toBe(true);
    expect(capacityTier.movePolicy).toBe(true);
    expect(capacityTier.moveDays).toBe("30");
  });
});
