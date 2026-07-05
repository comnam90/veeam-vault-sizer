import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RepoTypePicker } from "./repo-type-picker";
import {
  CAPACITY_TIER_TYPES,
  PERFORMANCE_TIER_TYPES,
  repoTypeRequiresImmutability,
  type RepositoryConfigErrors,
  type SobrConfig,
} from "@/types/simple-mode";

interface SobrBuilderProps {
  value: SobrConfig;
  errors?: RepositoryConfigErrors["sobr"];
  onChange: (value: SobrConfig) => void;
}

export function SobrBuilder({ value, errors, onChange }: SobrBuilderProps) {
  const performanceImmutableId = useId();
  const copyPolicyId = useId();
  const movePolicyId = useId();
  const capacityMoveDaysId = useId();
  const capacityImmutableId = useId();
  const archiveMoveDaysId = useId();
  const archiveImmutableId = useId();
  const standaloneId = useId();

  const showPerformanceImmutability = repoTypeRequiresImmutability(
    value.performanceType,
  );

  function setCapacityTier(patch: Partial<SobrConfig["capacityTier"]>) {
    onChange({ ...value, capacityTier: { ...value.capacityTier, ...patch } });
  }

  function setArchiveTier(patch: Partial<SobrConfig["archiveTier"]>) {
    onChange({ ...value, archiveTier: { ...value.archiveTier, ...patch } });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-tier-performance flex flex-col gap-3 border-l-2 pl-4">
        <h3 className="text-tier-performance text-sm font-semibold">
          Performance Tier
        </h3>
        <RepoTypePicker
          value={value.performanceType}
          allowedTypes={PERFORMANCE_TIER_TYPES}
          onChange={(performanceType) =>
            onChange({ ...value, performanceType })
          }
        />
        {showPerformanceImmutability ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={performanceImmutableId}>Immutable for (Days)</Label>
            <Input
              id={performanceImmutableId}
              aria-label="Performance Tier immutability period (days)"
              value={value.performanceImmutableDays}
              inputMode="numeric"
              onChange={(e) =>
                onChange({
                  ...value,
                  performanceImmutableDays: e.target.value,
                })
              }
              aria-invalid={errors?.performanceImmutableDays ? true : undefined}
              className="w-20"
            />
            {errors?.performanceImmutableDays ? (
              <p className="text-destructive text-xs">
                {errors.performanceImmutableDays}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-tier-capacity flex flex-col gap-3 border-l-2 pl-4">
        {!value.capacityTier.enabled ? (
          <>
            <h3 className="text-tier-capacity text-sm font-semibold">
              Capacity Tier
            </h3>
            <button
              type="button"
              onClick={() => setCapacityTier({ enabled: true })}
              className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-left text-sm"
            >
              + Add Capacity Tier (Configure Scale-Out Cloud Storage)
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-tier-capacity text-sm font-semibold">
                Capacity Tier
              </h3>
              <button
                type="button"
                onClick={() => setCapacityTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            <RepoTypePicker
              value={value.capacityTier.type}
              allowedTypes={CAPACITY_TIER_TYPES}
              onChange={(type) => setCapacityTier({ type })}
            />
            <div className="flex items-center gap-2">
              <Switch
                id={copyPolicyId}
                checked={value.capacityTier.copyPolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ copyPolicy: checked })
                }
              />
              <Label
                htmlFor={copyPolicyId}
                className="font-normal tracking-normal normal-case"
              >
                Copy backups immediately
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={movePolicyId}
                checked={value.capacityTier.movePolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ movePolicy: checked })
                }
              />
              <Label
                htmlFor={movePolicyId}
                className="font-normal tracking-normal normal-case"
              >
                Move backups older than
              </Label>
              {value.capacityTier.movePolicy ? (
                <Input
                  id={capacityMoveDaysId}
                  aria-label="Move backups older than (days)"
                  value={value.capacityTier.moveDays}
                  inputMode="numeric"
                  onChange={(e) =>
                    setCapacityTier({ moveDays: e.target.value })
                  }
                  aria-invalid={
                    errors?.capacityTier?.moveDays ? true : undefined
                  }
                  className="w-20"
                />
              ) : null}
              <span className="text-muted-foreground text-sm">days</span>
            </div>
            {errors?.capacityTier?.moveDays ? (
              <p className="text-destructive text-xs">
                {errors.capacityTier.moveDays}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={capacityImmutableId}>Immutable for (Days)</Label>
              <Input
                id={capacityImmutableId}
                aria-label="Capacity Tier immutability period (days)"
                value={value.capacityTier.immutableDays}
                inputMode="numeric"
                onChange={(e) =>
                  setCapacityTier({ immutableDays: e.target.value })
                }
                aria-invalid={
                  errors?.capacityTier?.immutableDays ? true : undefined
                }
                className="w-20"
              />
              {errors?.capacityTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.capacityTier.immutableDays}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="border-tier-archive flex flex-col gap-3 border-l-2 pl-4">
        {!value.archiveTier.enabled ? (
          <>
            <h3 className="text-tier-archive text-sm font-semibold">
              Archive Tier
            </h3>
            <button
              type="button"
              onClick={() => setArchiveTier({ enabled: true })}
              className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-left text-sm"
            >
              + Add Archive Tier (Configure GFS Offloading)
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-tier-archive text-sm font-semibold">
                Archive Tier
              </h3>
              <button
                type="button"
                onClick={() => setArchiveTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={archiveMoveDaysId}>
                Move GFS archives older than
              </Label>
              <Input
                id={archiveMoveDaysId}
                aria-label="Move GFS archives older than (days)"
                value={value.archiveTier.moveDays}
                inputMode="numeric"
                onChange={(e) => setArchiveTier({ moveDays: e.target.value })}
                aria-invalid={errors?.archiveTier?.moveDays ? true : undefined}
                className="w-20"
              />
              <span className="text-muted-foreground text-sm">days</span>
            </div>
            {errors?.archiveTier?.moveDays ? (
              <p className="text-destructive text-xs">
                {errors.archiveTier.moveDays}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={archiveImmutableId}>Immutable for (Days)</Label>
              <Input
                id={archiveImmutableId}
                aria-label="Archive Tier immutability period (days)"
                value={value.archiveTier.immutableDays}
                inputMode="numeric"
                onChange={(e) =>
                  setArchiveTier({ immutableDays: e.target.value })
                }
                aria-invalid={
                  errors?.archiveTier?.immutableDays ? true : undefined
                }
                className="w-20"
              />
              {errors?.archiveTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.archiveTier.immutableDays}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={standaloneId}
                checked={value.archiveTier.standaloneFullBackups}
                onCheckedChange={(checked) =>
                  setArchiveTier({ standaloneFullBackups: checked })
                }
              />
              <Label
                htmlFor={standaloneId}
                className="font-normal tracking-normal normal-case"
              >
                Standalone full backups (no shared blocks)
              </Label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
