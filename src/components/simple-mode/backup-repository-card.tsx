import { useId, type ReactNode } from "react";
import { Network } from "lucide-react";
import { VaultIcon } from "@/components/icons/vault-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import { RepoTypePicker } from "./repo-type-picker";
import { RetentionOverrideBlock } from "./retention-override-block";
import { SobrBuilder } from "./sobr-builder";
import {
  PRIMARY_REPO_TYPES,
  repoTypeRequiresImmutability,
  type RepositoryConfigValues,
  type TargetRepository,
  type WorkloadDataValues,
} from "@/types/simple-mode";

interface BackupRepositoryCardProps {
  value: RepositoryConfigValues;
  workloadData: WorkloadDataValues;
  onChange: (value: RepositoryConfigValues) => void;
}

interface TargetRepositoryCardProps {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

function TargetRepositoryCard({
  label,
  icon,
  selected,
  onSelect,
}: TargetRepositoryCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-input bg-background hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function BackupRepositoryCard({
  value,
  workloadData,
  onChange,
}: BackupRepositoryCardProps) {
  const errors = validateRepositoryConfig(value);
  const backupPathGroupId = useId();
  const targetRepoGroupId = useId();
  const primaryImmutableId = useId();
  const targetImmutableId = useId();

  function setTargetRepository(targetRepository: TargetRepository) {
    onChange({ ...value, targetRepository });
  }

  const targetRepositorySection = (
    <>
      <div className="flex flex-col gap-3">
        <Label id={targetRepoGroupId}>Select Target Repository</Label>
        <div
          role="group"
          aria-labelledby={targetRepoGroupId}
          className="grid grid-cols-3 gap-3"
        >
          <TargetRepositoryCard
            label="Vault Azure"
            icon={<VaultIcon aria-hidden="true" className="size-6" />}
            selected={value.targetRepository === "vault-azure"}
            onSelect={() => setTargetRepository("vault-azure")}
          />
          <TargetRepositoryCard
            label="Vault AWS"
            icon={<VaultIcon aria-hidden="true" className="size-6" />}
            selected={value.targetRepository === "vault-aws"}
            onSelect={() => setTargetRepository("vault-aws")}
          />
          <TargetRepositoryCard
            label="SOBR Builder"
            icon={<Network aria-hidden="true" className="size-6" />}
            selected={value.targetRepository === "sobr"}
            onSelect={() => setTargetRepository("sobr")}
          />
        </div>
      </div>

      {value.targetRepository !== "sobr" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={targetImmutableId}>Immutable for (Days)</Label>
          <Input
            id={targetImmutableId}
            aria-label="Target repository immutability period (days)"
            value={value.targetRepositoryImmutableDays}
            inputMode="numeric"
            onChange={(e) =>
              onChange({
                ...value,
                targetRepositoryImmutableDays: e.target.value,
              })
            }
            aria-invalid={
              errors.targetRepositoryImmutableDays ? true : undefined
            }
            className="w-20"
          />
          {errors.targetRepositoryImmutableDays ? (
            <p className="text-destructive text-xs">
              {errors.targetRepositoryImmutableDays}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border-border rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Scale-Out Backup Repository (SOBR) Design
          </h3>
          <SobrBuilder
            value={value.sobr}
            errors={errors.sobr}
            onChange={(sobr) => onChange({ ...value, sobr })}
          />
        </div>
      )}
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Network aria-hidden="true" className="text-primary size-5" />
          Vault Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label id={backupPathGroupId}>Backup Path</Label>
          <RadioGroup
            aria-labelledby={backupPathGroupId}
            value={value.backupPath}
            onValueChange={(backupPath) =>
              onChange({
                ...value,
                backupPath: backupPath as RepositoryConfigValues["backupPath"],
              })
            }
          >
            <label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="direct" />
              Direct to Vault
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="copy" />
              Backup Copy to Vault
            </label>
          </RadioGroup>
        </div>

        {value.backupPath === "copy" ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Primary Repository</h3>
            <RepoTypePicker
              value={value.primary.repoType}
              allowedTypes={PRIMARY_REPO_TYPES}
              onChange={(repoType) =>
                onChange({ ...value, primary: { ...value.primary, repoType } })
              }
            />
            {repoTypeRequiresImmutability(value.primary.repoType) ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={primaryImmutableId}>Immutable for (Days)</Label>
                <Input
                  id={primaryImmutableId}
                  aria-label="Primary immutability period (days)"
                  value={value.primary.immutableDays}
                  inputMode="numeric"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      primary: {
                        ...value.primary,
                        immutableDays: e.target.value,
                      },
                    })
                  }
                  aria-invalid={
                    errors.primary?.immutableDays ? true : undefined
                  }
                  className="w-20"
                />
                {errors.primary?.immutableDays ? (
                  <p className="text-destructive text-xs">
                    {errors.primary.immutableDays}
                  </p>
                ) : null}
              </div>
            ) : null}
            <RetentionOverrideBlock
              context="Primary"
              checkboxLabel="Customize retention"
              value={value.primary.retention}
              workloadData={workloadData}
              errors={errors.primary?.retention}
              onChange={(retention) =>
                onChange({
                  ...value,
                  primary: { ...value.primary, retention },
                })
              }
            />
          </div>
        ) : null}

        {value.backupPath === "copy" ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">
              Secondary Vault/Cloud Repository
            </h3>
            {targetRepositorySection}
            <RetentionOverrideBlock
              context="Secondary"
              checkboxLabel="Customize copy retention"
              value={value.secondaryRetention}
              workloadData={workloadData}
              errors={errors.secondaryRetention}
              onChange={(secondaryRetention) =>
                onChange({ ...value, secondaryRetention })
              }
            />
          </div>
        ) : (
          targetRepositorySection
        )}
      </CardContent>
    </Card>
  );
}
