import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DograhEnv = {
  DOGRAH_API_URL?: string;
  DOGRAH_API_KEY?: string;
  DOGRAH_USE_MOCK?: string;
  LANGFUSE_HOST?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  EVAL_DEEPEVAL?: string;
  EVAL_RAGAS?: string;
  EVAL_PROMPTFOO?: string;
};

const FILE_KEYS: (keyof DograhEnv)[] = [
  "DOGRAH_API_URL",
  "DOGRAH_API_KEY",
  "DOGRAH_USE_MOCK",
  "LANGFUSE_HOST",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "EVAL_DEEPEVAL",
  "EVAL_RAGAS",
  "EVAL_PROMPTFOO",
];

let cached: DograhEnv | null = null;

/**
 * Read Dograh env from process (dynamic key access so Vite won't strip) + .env file.
 * Server-only.
 */
export function loadDograhEnv(): DograhEnv {
  if (cached) return cached;

  const fromFile: DograhEnv = {};
  const candidates = [resolve(process.cwd(), ".env"), "/workspace/.env"];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const text = readFileSync(file, "utf8");
      for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim() as keyof DograhEnv;
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if ((FILE_KEYS as string[]).includes(key)) {
          fromFile[key] = value;
        }
      }
      break;
    } catch {
      /* next */
    }
  }

  const proc = typeof process !== "undefined" ? process.env : undefined;
  const pick = (k: keyof DograhEnv) => {
    const fromProc = proc ? proc[k] : undefined;
    if (fromProc != null && fromProc !== "") return fromProc;
    return fromFile[k];
  };

  cached = {};
  for (const k of FILE_KEYS) {
    cached[k] = pick(k);
  }
  return cached;
}

export function ensureDograhEnvLoaded() {
  loadDograhEnv();
}

/** Clear cache (tests / hot reload after .env edit) */
export function clearEnvCache() {
  cached = null;
}
