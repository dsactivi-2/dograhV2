import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ContextViewer({
  title,
  description,
  data,
}: {
  title: string;
  description?: string;
  data: unknown;
}) {
  const empty =
    data == null ||
    (typeof data === "object" && !Array.isArray(data) && Object.keys(data as object).length === 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
