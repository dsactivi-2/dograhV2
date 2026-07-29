import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AudioPlayer({
  url,
  label = "Recording",
}: {
  url?: string | null;
  label?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {url ? "Playback from Dograh recording URL" : "No recording available"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {url ? (
          <div className="space-y-3">
            <audio controls preload="metadata" className="w-full" src={url}>
              Your browser does not support audio playback.
            </audio>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Open original file
            </a>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Recording not available for this run
          </div>
        )}
      </CardContent>
    </Card>
  );
}
