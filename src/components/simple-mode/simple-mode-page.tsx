import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
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
