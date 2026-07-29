import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { endOfDay, startOfDay, subDays } from "date-fns";
import type { DateRange } from "./dograh/types";

interface DateRangeContextValue {
  range: DateRange;
  setRange: (range: DateRange) => void;
  preset: string | null;
  setPreset: (preset: string | null) => void;
  /** ISO strings for API filters */
  filterFrom: string | null;
  filterTo: string | null;
  label: string;
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

const PRESETS: Record<string, () => DateRange> = {
  today: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  "7d": () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  "30d": () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  "90d": () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }),
  all: () => ({ from: null, to: null }),
};

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<string | null>("30d");
  const [range, setRangeState] = useState<DateRange>(() => PRESETS["30d"]!());

  const setRange = useCallback((next: DateRange) => {
    setRangeState(next);
    setPresetState(null);
  }, []);

  const setPreset = useCallback((key: string | null) => {
    if (!key || !PRESETS[key]) {
      setPresetState(null);
      return;
    }
    setPresetState(key);
    setRangeState(PRESETS[key]!());
  }, []);

  const value = useMemo<DateRangeContextValue>(() => {
    const filterFrom = range.from ? range.from.toISOString() : null;
    const filterTo = range.to ? range.to.toISOString() : null;
    let label = "All time";
    if (preset === "today") label = "Today";
    else if (preset === "7d") label = "Last 7 days";
    else if (preset === "30d") label = "Last 30 days";
    else if (preset === "90d") label = "Last 90 days";
    else if (preset === "all") label = "All time";
    else if (range.from && range.to) {
      label = `${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}`;
    } else if (range.from) {
      label = `From ${range.from.toLocaleDateString()}`;
    }
    return { range, setRange, preset, setPreset, filterFrom, filterTo, label };
  }, [range, setRange, preset, setPreset]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}

export { PRESETS };
