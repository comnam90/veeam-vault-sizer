import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SimpleModePlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Simple Mode calculator — coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Workload inputs and sizing results will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
