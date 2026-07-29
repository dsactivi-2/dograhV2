import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Gauge, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { DateRangePicker } from "./date-range-picker";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  trailing,
  subtitle,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  subtitle?: string;
}) {
  const { theme, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onOptimize = pathname.startsWith("/optimize");

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-primary text-primary-foreground shadow-sm">
              <Activity className="size-3.5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                Dograh Ops
              </div>
              <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {subtitle ?? "Campaign operations"}
              </div>
            </div>
          </Link>

          <nav className="ml-1 flex items-center gap-0.5 sm:ml-2 sm:gap-1">
            <Link
              to="/"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5",
                !onOptimize
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              Overview
            </Link>
            <Link
              to="/optimize"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-2.5",
                onOptimize
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Gauge className="size-3.5" />
              Optimize
            </Link>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 shrink">{trailing}</div>
            <DateRangePicker />
            <Button
              variant="outline"
              size="icon"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="shrink-0"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </header>
      <main className={cn("mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8")}>
        {children}
      </main>
    </div>
  );
}
