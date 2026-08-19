import { useRef, useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import { ProjectedSizingCard } from "./projected-sizing-card";
import { SnapshotPanel } from "./snapshot-panel";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type Snapshot,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );
  const [repositoryConfig, setRepositoryConfig] =
    useState<RepositoryConfigValues>(DEFAULT_REPOSITORY_CONFIG_VALUES);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );

  // Monotonically increasing — never derived from `snapshots.length`, so a
  // default label is never reused after a snapshot is deleted (deleting
  // "Snapshot 1" out of ["Snapshot 1", "Snapshot 2"] must not cause the
  // next snapshot to be labeled "Snapshot 2" again).
  const nextSnapshotNumberRef = useRef(0);

  // Same validators the form itself uses — if the CURRENT inputs are
  // invalid, `data` may still hold a stale successful result from before
  // the edit, and a snapshot must not be captured against that mismatch.
  const hasCurrentValidationErrors =
    Object.keys(validateWorkloadData(workloadData)).length > 0 ||
    Object.keys(validateRepositoryConfig(repositoryConfig, workloadData))
      .length > 0;

  const canSnapshot =
    data !== null &&
    !isLoading &&
    error === null &&
    !hasCurrentValidationErrors;

  function handleSnapshot() {
    if (!canSnapshot) return;
    nextSnapshotNumberRef.current += 1;
    setSnapshots((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: `Snapshot ${nextSnapshotNumberRef.current}`,
        workloadData,
        repositoryConfig,
        data,
      },
    ]);
  }

  function handleRenameSnapshot(id: string, label: string) {
    setSnapshots((prev) =>
      prev.map((snapshot) =>
        snapshot.id === id ? { ...snapshot, label } : snapshot,
      ),
    );
  }

  function handleDeleteSnapshot(id: string) {
    setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== id));
  }

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
        <BackupRepositoryCard
          value={repositoryConfig}
          workloadData={workloadData}
          onChange={setRepositoryConfig}
        />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-4">
        <ProjectedSizingCard
          workloadData={workloadData}
          repositoryConfig={repositoryConfig}
          data={data}
          isLoading={isLoading}
          error={error}
          canSnapshot={canSnapshot}
          onChange={setWorkloadData}
          onSnapshot={handleSnapshot}
        />
        <SnapshotPanel
          snapshots={snapshots}
          live={{ label: "Live", workloadData, repositoryConfig, data }}
          onRename={handleRenameSnapshot}
          onDelete={handleDeleteSnapshot}
        />
      </div>
    </div>
  );
}
