import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getRepositoryConfigComparisonRows,
  getSizingComparisonRows,
  getWorkloadDataComparisonRows,
  type CompareEntry,
  type ComparisonRow,
} from "@/lib/simple-mode/compare-sizings";

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: CompareEntry[];
}

// Cells key on column index, not entry.label — a later task makes snapshot
// labels user-renameable, so two entries (e.g. two snapshots both renamed to
// the same string) can share a label. Column order is stable while the
// dialog is open, so index is a safe, collision-free key.
function ComparisonTable({
  entries,
  rows,
}: {
  entries: CompareEntry[];
  rows: ComparisonRow[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-border border-b">
          <th className="py-1.5 pr-2 text-left font-medium"> </th>
          {entries.map((entry, index) => (
            <th key={index} className="py-1.5 pr-2 text-right font-medium">
              {entry.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-border border-t">
            <td className="text-muted-foreground py-1.5 pr-2">{row.label}</td>
            {row.values.map((value, index) => (
              <td
                key={`${row.label}-${index}`}
                className="py-1.5 pr-2 text-right font-mono"
              >
                {value ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CompareDialog({
  open,
  onOpenChange,
  entries,
}: CompareDialogProps) {
  const sizingRows = getSizingComparisonRows(entries);
  const workloadDataRows = getWorkloadDataComparisonRows(entries);
  const repositoryConfigRows = getRepositoryConfigComparisonRows(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compare Sizings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <ComparisonTable entries={entries} rows={sizingRows} />
          <details className="border-border rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Workload Data
            </summary>
            <div className="pt-3">
              <ComparisonTable entries={entries} rows={workloadDataRows} />
            </div>
          </details>
          <details className="border-border rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Repository Configuration
            </summary>
            <div className="pt-3">
              <ComparisonTable entries={entries} rows={repositoryConfigRows} />
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
