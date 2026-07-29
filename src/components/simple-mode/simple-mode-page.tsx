import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import { ProjectedSizingCard } from "./projected-sizing-card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
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
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );

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
          onChange={setWorkloadData}
          onSnapshot={() => {}}
        />
      </div>
    </div>
  );
}
