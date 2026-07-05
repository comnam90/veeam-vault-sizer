import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const capacityEnabledId = useId();
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
        <div className="flex items-center gap-2">
          <Checkbox
            id={capacityEnabledId}
            checked={value.capacityTier.enabled}
            onCheckedChange={(checked) =>
              setCapacityTier({ enabled: checked === true })
            }
          />
          <Label
            htmlFor={capacityEnabledId}
            className="text-tier-capacity font-semibold tracking-normal normal-case"
          >
            Capacity Tier
          </Label>
        </div>

        {value.capacityTier.enabled ? (
          <>
            <RepoTypePicker
              value={value.capacityTier.type}
              allowedTypes={CAPACITY_TIER_TYPES}
              onChange={(type) => setCapacityTier({ type })}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={copyPolicyId}
                checked={value.capacityTier.copyPolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ copyPolicy: checked === true })
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
              <Checkbox
                id={movePolicyId}
                checked={value.capacityTier.movePolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ movePolicy: checked === true })
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
              />
              {errors?.capacityTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.capacityTier.immutableDays}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="border-tier-archive flex flex-col gap-3 border-l-2 pl-4">
        <h3 className="text-tier-archive text-sm font-semibold">
          Archive Tier
        </h3>
        {!value.archiveTier.enabled ? (
          <button
            type="button"
            onClick={() => setArchiveTier({ enabled: true })}
            className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-left text-sm"
          >
            + Add Archive Tier (Configure GFS Offloading)
          </button>
        ) : (
          <>
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
              <button
                type="button"
                onClick={() => setArchiveTier({ enabled: false })}
                className="text-muted-foreground ml-auto text-xs underline"
              >
                Remove
              </button>
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
              />
              {errors?.archiveTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.archiveTier.immutableDays}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={standaloneId}
                checked={value.archiveTier.standaloneFullBackups}
                onCheckedChange={(checked) =>
                  setArchiveTier({ standaloneFullBackups: checked === true })
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
