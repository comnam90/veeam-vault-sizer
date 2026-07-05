import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );
  const [repositoryConfig, setRepositoryConfig] =
    useState<RepositoryConfigValues>(DEFAULT_REPOSITORY_CONFIG_VALUES);

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
      <div className="lg:col-span-4">
        <div
          data-testid="simple-mode-sidebar-placeholder"
          className="border-border h-full min-h-40 rounded-lg border border-dashed"
        />
      </div>
    </div>
  );
}
