import { CalendarDays } from "lucide-react";
import { useDateRange } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRESET_BUTTONS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
] as const;

export function DateRangePicker({ className }: { className?: string }) {
  const { range, setRange, preset, setPreset, label } = useDateRange();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="hidden items-center rounded-lg border border-border bg-background p-0.5 md:flex">
        {PRESET_BUTTONS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              preset === p.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 font-normal">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <span className="max-w-40 truncate sm:max-w-none">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div>
            <p className="text-sm font-medium">Date range</p>
            <p className="text-xs text-muted-foreground">
              Filters statistics and run lists to this period
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 md:hidden">
            {PRESET_BUTTONS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={range.from ? toInputDate(range.from) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setRange({
                    from: v ? startOfInputDate(v) : null,
                    to: range.to,
                  });
                }}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={range.to ? toInputDate(range.to) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setRange({
                    from: range.from,
                    to: v ? endOfInputDate(v) : null,
                  });
                }}
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfInputDate(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

function endOfInputDate(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999);
}
