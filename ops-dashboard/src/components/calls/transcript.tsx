import type { TranscriptEntry } from "@/lib/dograh/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function normalizeEntries(transcript: TranscriptEntry[] | string | null | undefined) {
  if (!transcript) return [];
  if (typeof transcript === "string") {
    try {
      const parsed = JSON.parse(transcript) as TranscriptEntry[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [{ role: "system", content: transcript }];
    }
  }
  if (Array.isArray(transcript)) return transcript;
  return [];
}

function entryText(entry: TranscriptEntry): string {
  if (typeof entry === "string") return entry;
  return entry.content || entry.text || entry.message || "";
}

function entryRole(entry: TranscriptEntry): string {
  if (typeof entry === "string") return "unknown";
  return (entry.role || entry.speaker || "unknown").toLowerCase();
}

export function TranscriptView({
  transcript,
  transcriptUrl,
}: {
  transcript?: TranscriptEntry[] | string | null;
  transcriptUrl?: string | null;
}) {
  const entries = normalizeEntries(transcript);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
        <CardDescription>
          {entries.length > 0
            ? `${entries.length} turns`
            : transcriptUrl
              ? "Full transcript available via URL"
              : "No transcript for this run"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {transcriptUrl ? (
              <a
                href={transcriptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Open transcript
              </a>
            ) : (
              "Transcript not available"
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, i) => {
              const role = entryRole(entry);
              const isUser = role === "user" || role === "human" || role === "caller";
              const isBot =
                role === "assistant" || role === "bot" || role === "agent" || role === "system";
              return (
                <li
                  key={i}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[min(100%,36rem)] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                      isUser && "bg-primary text-primary-foreground",
                      isBot && "bg-muted text-foreground",
                      !isUser && !isBot && "bg-secondary text-secondary-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1 text-[10px] font-medium uppercase tracking-wide",
                        isUser ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {role}
                    </div>
                    <p className="whitespace-pre-wrap">{entryText(entry)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
