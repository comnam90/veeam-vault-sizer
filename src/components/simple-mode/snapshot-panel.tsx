import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CompareDialog } from "./compare-dialog";
import {
  getTotalRequiredStorageTB,
  type CompareEntry,
} from "@/lib/simple-mode/compare-sizings";
import type { Snapshot } from "@/types/simple-mode";

const MAX_COMPARE_SNAPSHOTS = 2;

interface SnapshotPanelProps {
  snapshots: Snapshot[];
  live: CompareEntry;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}

export function SnapshotPanel({
  snapshots,
  live,
  onRename,
  onDelete,
}: SnapshotPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((existing) => existing !== id);
      if (prev.length >= MAX_COMPARE_SNAPSHOTS) return prev;
      return [...prev, id];
    });
  }

  function handleDelete(id: string) {
    setSelectedIds((prev) => prev.filter((existing) => existing !== id));
    onDelete(id);
  }

  const selectedSnapshots = snapshots.filter((snapshot) =>
    selectedIds.includes(snapshot.id),
  );
  const compareEntries: CompareEntry[] = [
    live,
    ...selectedSnapshots.map((snapshot) => ({
      label: snapshot.label,
      workloadData: snapshot.workloadData,
      repositoryConfig: snapshot.repositoryConfig,
      data: snapshot.data,
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved Sizings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {snapshots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No saved sizings yet. Use "Snapshot current sizing" above to hold
            one for comparison.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snapshot) => {
              const totalTB = getTotalRequiredStorageTB(snapshot.data);
              const isSelected = selectedIds.includes(snapshot.id);
              return (
                <li
                  key={snapshot.id}
                  className="border-border flex items-center gap-2 rounded-md border p-2"
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={
                      !isSelected && selectedIds.length >= MAX_COMPARE_SNAPSHOTS
                    }
                    onCheckedChange={() => toggleSelected(snapshot.id)}
                    aria-label={`Include ${snapshot.label} in comparison`}
                  />
                  <Input
                    value={snapshot.label}
                    onChange={(event) =>
                      onRename(snapshot.id, event.target.value)
                    }
                    className="h-8 flex-1"
                    aria-label="Rename snapshot label"
                  />
                  <span className="font-mono text-sm">
                    {totalTB === null ? "—" : `${totalTB.toFixed(1)} TB`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(snapshot.id)}
                    aria-label={`Delete ${snapshot.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          variant="secondary"
          disabled={selectedIds.length === 0}
          onClick={() => setIsCompareOpen(true)}
        >
          Compare selected ({selectedIds.length})
        </Button>
      </CardContent>
      <CompareDialog
        open={isCompareOpen}
        onOpenChange={setIsCompareOpen}
        entries={compareEntries}
      />
    </Card>
  );
}
