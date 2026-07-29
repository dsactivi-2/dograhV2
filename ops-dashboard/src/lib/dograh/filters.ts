import type { Json } from "./types";

/**
 * Dograh list-runs filters are a JSON-encoded **array**:
 * `[{ attribute: "dateRange", value: { from, to } }, ...]`
 * Sending a plain object causes API 500s.
 */
export function buildDograhRunFilters(input: {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  phone?: string | null;
  disposition?: string | null;
}): string | null {
  const filters: Array<{ attribute: string; value: Json }> = [];

  if (input.from || input.to) {
    filters.push({
      attribute: "dateRange",
      value: {
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {}),
      },
    });
  }

  if (input.status) {
    filters.push({ attribute: "status", value: input.status });
  }
  if (input.phone) {
    filters.push({ attribute: "phoneNumber", value: input.phone });
  }
  if (input.disposition) {
    filters.push({ attribute: "disposition", value: input.disposition });
  }

  if (filters.length === 0) return null;
  return JSON.stringify(filters);
}
