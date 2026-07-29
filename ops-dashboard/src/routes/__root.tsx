import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createQueryClient } from "@/lib/query-client";
import { DateRangeProvider } from "@/lib/date-range";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Dograh Ops — Live Campaign Dashboard",
      },
      {
        name: "description",
        content: "Real-time operations dashboard for Dograh outbound campaigns",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center text-foreground">
      <p className="text-sm text-muted-foreground">Page not found</p>
      <a href="/" className="text-sm font-medium underline-offset-4 hover:underline">
        Back to overview
      </a>
    </div>
  ),
});

function RootComponent() {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DateRangeProvider>
            <TooltipProvider delayDuration={200}>
              <Outlet />
            </TooltipProvider>
          </DateRangeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
