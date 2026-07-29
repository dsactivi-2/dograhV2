import { ExternalLink } from "lucide-react";
import type { WorkflowRun } from "@/lib/dograh/types";
import {
  buildLangfuseHostFallback,
  getLangfuseTraceId,
  getLangfuseTraceUrl,
} from "@/lib/dograh/langfuse";
import { Button } from "@/components/ui/button";

export function OpenInLangfuseButton({
  run,
  hostFallback,
  className,
}: {
  run?: WorkflowRun | null;
  hostFallback?: string | null;
  className?: string;
}) {
  const direct = getLangfuseTraceUrl(run);
  const href = direct || buildLangfuseHostFallback(hostFallback, run);
  const traceId = getLangfuseTraceId(run);

  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled className={className} title="No Langfuse trace on this run">
        Open in Langfuse
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" className={className} asChild>
      <a href={href} target="_blank" rel="noreferrer" title={traceId ? `Trace ${traceId}` : "Langfuse"}>
        <ExternalLink className="size-3.5" />
        Open in Langfuse
        {direct ? null : <span className="text-muted-foreground"> (search)</span>}
      </a>
    </Button>
  );
}
