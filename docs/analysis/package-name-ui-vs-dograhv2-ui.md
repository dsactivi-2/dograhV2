# Analyse: UI-Paketname (`ui` vs `dograhv2-ui`)

**Branch:** `pre-pre-main`  
**Datum:** 17. August 2026  
**Status:** READ-ONLY / DRY-RUN — Keine Code-Änderungen

---

## Zusammenfassung

Der npm-Paketname in `ui/package.json` wurde im Commit `deb7b8b` ("chore: brand public fork as DograhV2") von `"ui"` zu `"dograhv2-ui"` umbenannt. Diese Analyse untersucht, wo dieser Name referenziert wird, welche Auswirkungen eine Rück- oder Beibehaltung hat, und empfiehlt eine Vorgehensweise.

---

## Faktenlage

### Wo erscheint `dograhv2-ui` im Repo?

| Datei | Zeile(n) | Kontext |
|-------|----------|---------|
| `ui/package.json` | 2 | `"name": "dograhv2-ui"` |
| `ui/package-lock.json` | 2, 8 | Root-Paketname und packages[""] |

**Gesamt: 3 Stellen in 2 Dateien**

### Wo wird `dograhv2-ui` NICHT referenziert?

| Bereich | Ergebnis |
|---------|----------|
| npm Workspaces | ❌ Kein Root `package.json` vorhanden |
| Andere Pakete als Dependency | ❌ Keine Referenz gefunden |
| Docker/Dockerfile | ❌ Nur Ordnerpfad `ui/` verwendet |
| GitHub CI/Workflows | ❌ Nur Ordnerpfad `ui/` und Image-Name `dograh-ui` |
| Vercel-Konfiguration | ❌ `vercel.json` enthält nur `git.deploymentEnabled: false` |
| Helm-Charts | ❌ UI-Templates verwenden Container-Image-Namen |
| Import-Statements | ❌ Keine `from "dograhv2-ui"` Imports |
| SDK/Examples | ❌ Keine Referenz |

### Branch-Status

| Branch | Paketname | Version |
|--------|-----------|---------|
| `main` | `dograhv2-ui` | 1.43.0 |
| `pre-pre-main` | `dograhv2-ui` | 1.43.0 |
| `Pre-main` | `dograhv2-ui` | 1.43.0 |
| `upstream/original` | `ui` | 1.45.0 |

### Paket-Eigenschaften

```json
{
  "name": "dograhv2-ui",
  "private": true
}
```

**`"private": true`** bedeutet:
- Das Paket wird **nicht** auf npm veröffentlicht
- Der Name ist **rein intern** und hat keine externe Sichtbarkeit
- Kein Namespace-Konflikt mit anderen npm-Paketen möglich

---

## Konflikt-Analyse

### Warum entstehen Lockfile-Konflikte?

Dependabot-PRs können Konflikte verursachen, wenn:

1. **Upstream-Merge:** Wenn Code vom `upstream/original` Branch (der `"name": "ui"` hat) in den Fork gemergt wird
2. **Alte PRs:** PRs, die vor dem Rebranding-Commit erstellt wurden
3. **Cross-Branch-Konflikte:** PRs zwischen Branches mit unterschiedlichen Namen

### Dependabot-Konfiguration

```yaml
# .github/dependabot.yml
- package-ecosystem: npm
  directory: "/ui"
  # Kein target-branch spezifiziert → zielt auf Default-Branch
```

Dependabot erstellt PRs basierend auf dem **aktuellen Stand** des Ziel-Branches. Da `main` und `pre-pre-main` beide bereits `dograhv2-ui` haben, sollten neue Dependabot-PRs diesen Namen erben.

---

## Optionen-Bewertung

### Option A: `dograhv2-ui` beibehalten (aktueller Zustand)

**Beschreibung:** Keine Änderung vornehmen. Zukünftige Dependabot-PRs von alten `"ui"`-Lockfiles verursachen Konflikte bis sie rebased werden.

| Aspekt | Bewertung |
|--------|-----------|
| Änderungsaufwand | Keiner |
| Risiko | **Klein** — PRs können manuell rebased werden |
| Upstream-Kompatibilität | ⚠️ Merge-Konflikte bei Upstream-Syncs |
| Branding-Konsistenz | ✅ Fork-Branding bleibt erhalten |

**Was bricht:**
- Upstream-Merges erfordern manuelle Konfliktauflösung im Lockfile
- Alte Dependabot-PRs (vor Rebranding) können nicht sauber gemergt werden

**Was funktioniert:**
- Alle Docker-Builds
- Alle CI-Pipelines
- Alle Deployments
- Alle npm-Befehle

**Empfohlene Vorgehensweise bei Konflikten:**
```bash
# Bei Lockfile-Konflikt nach Rebase/Merge:
git checkout --theirs ui/package-lock.json  # oder --ours, je nach Präferenz
cd ui && npm install                          # Regeneriert Lockfile sauber
```

---

### Option B: Zurück zu `"ui"` umbenennen

**Beschreibung:** Den Paketnamen auf allen Fork-Branches zurück zu `"ui"` ändern, um Upstream-Kompatibilität herzustellen.

#### Zu ändernde Dateien

| Datei | Zeile | Alt | Neu |
|-------|-------|-----|-----|
| `ui/package.json` | 2 | `"name": "dograhv2-ui"` | `"name": "ui"` |
| `ui/package-lock.json` | 2 | `"name": "dograhv2-ui"` | `"name": "ui"` |
| `ui/package-lock.json` | 8 | `"name": "dograhv2-ui"` | `"name": "ui"` |

**Gesamt: 3 Zeilen in 2 Dateien**

#### Auswirkungen

| Bereich | Auswirkung |
|---------|------------|
| Docker | ❌ Keine — Dockerfile verwendet Ordnerpfad |
| CI/GitHub Actions | ❌ Keine — Workflows verwenden Ordnerpfad |
| Vercel | ❌ Keine — Deployment deaktiviert |
| Helm/Kubernetes | ❌ Keine — Verwendet Container-Image |
| npm install/build | ❌ Keine — Private Pakete ignorieren Name |
| Andere Pakete | ❌ Keine — Keine Abhängigkeiten |
| Import-Statements | ❌ Keine — Keine Imports vom Paketnamen |

| Aspekt | Bewertung |
|--------|-----------|
| Änderungsaufwand | **Minimal** — 3 Zeilen |
| Risiko | **Klein** — Name ist effektiv kosmetisch |
| Upstream-Kompatibilität | ✅ Volle Kompatibilität |
| Branding-Konsistenz | ⚠️ Paketname weicht von Fork-Branding ab |

**Was bricht:** Nichts (bestätigt durch Analyse)

**Was funktioniert:** Alles wie zuvor, plus saubere Upstream-Merges

---

### Option C: Alias/Link erstellen

**Beschreibung:** Technische Lösungen, um beide Namen zu unterstützen.

#### C1: npm-Alias

Nicht anwendbar — npm-Aliase sind für **Dependencies**, nicht für das eigene Paket.

#### C2: Lockfile-Only-Alignment

Nicht praktikabel — `npm install` regeneriert den Lockfile immer basierend auf `package.json`.

#### C3: Git-Merge-Driver

```gitattributes
ui/package-lock.json merge=npm-lockfile
```

Theoretisch möglich, aber:
- Erfordert custom Merge-Driver auf allen Entwicklermaschinen
- Dependabot ignoriert custom Merge-Driver
- Erhöht Komplexität ohne echten Nutzen

| Aspekt | Bewertung |
|--------|-----------|
| Änderungsaufwand | **Hoch** — Tooling-Setup erforderlich |
| Risiko | **Mittel** — Ungetestete Konfiguration |
| Upstream-Kompatibilität | ⚠️ Nur teilweise |
| Wartbarkeit | ❌ Erhöhte Komplexität |

**Empfehlung:** Option C ist überkompliziert für ein kosmetisches Problem.

---

### Option D: Alternative Ansätze

#### D1: Dependabot-Konfiguration anpassen

```yaml
# .github/dependabot.yml
- package-ecosystem: npm
  directory: "/ui"
  target-branch: "pre-pre-main"  # Explizit setzen
```

**Vorteil:** PRs werden konsistent gegen den gewünschten Branch erstellt.

**Nachteil:** Löst nicht das Upstream-Merge-Problem.

#### D2: Incoming-Name-Hunks akzeptieren

Bei Merge-Konflikten immer die "incoming" (Upstream) Version des `name`-Feldes akzeptieren:

```bash
# Bei Konflikt:
git checkout --theirs ui/package.json ui/package-lock.json
cd ui && npm install
```

**Vorteil:** Einfach, keine Code-Änderung nötig.

**Nachteil:** Macht das Rebranding im Paket rückgängig.

#### D3: Name als irrelevant behandeln

Da `"private": true` gesetzt ist und der Name nirgends referenziert wird:
- Der Ordner bleibt `ui/`
- Der Paketname ist effektiv bedeutungslos
- Konflikte können trivial durch Lockfile-Regeneration gelöst werden

| Aspekt | Bewertung |
|--------|-----------|
| Änderungsaufwand | Keiner |
| Risiko | **Klein** |
| Praktikabilität | ✅ Funktioniert sofort |

---

## Empfehlung

### Primäre Empfehlung: Option B (Zurück zu `"ui"`)

**Begründung:**

1. **Der Name ist effektiv kosmetisch** — Das Paket ist `private`, wird nicht veröffentlicht, und wird nirgends als Dependency referenziert.

2. **Minimaler Aufwand** — Nur 3 Zeilen in 2 Dateien.

3. **Maximale Kompatibilität** — Upstream-Syncs und Dependabot-PRs funktionieren ohne Konflikte.

4. **Kein Breaking Change** — Keine Docker-, CI-, oder Deployment-Änderungen erforderlich.

5. **Branding bleibt erhalten** — Das Repository, die UI selbst, die Dokumentation und alle sichtbaren Elemente behalten das DograhV2-Branding. Nur ein internes, unsichtbares `name`-Feld ändert sich.

### Alternative: Option A + D3

Falls das Fork-Branding im Paketnamen gewünscht ist:
- `dograhv2-ui` beibehalten
- Konflikte durch Lockfile-Regeneration lösen (`npm install`)
- Als dokumentiertes Verfahren für Upstream-Syncs etablieren

---

## Risiko-Matrix

| Option | Risiko | Aufwand | Upstream-Kompatibilität | Empfehlung |
|--------|--------|---------|-------------------------|------------|
| A: Beibehalten | Klein | Keiner | ⚠️ Konflikte | Akzeptabel |
| B: Zurück zu `ui` | Klein | Minimal | ✅ Voll | **Empfohlen** |
| C: Alias/Link | Mittel | Hoch | ⚠️ Teilweise | Nicht empfohlen |
| D: Workarounds | Klein | Keiner | ⚠️ Manuell | Fallback |

---

## Anhang: Verifizierte Nicht-Abhängigkeiten

Die folgenden Bereiche wurden geprüft und haben **keine** Referenz auf den Paketnamen `dograhv2-ui` oder `ui` als npm-Paketidentifikator:

- ✅ `sdk/typescript/package.json` — Keine UI-Dependency
- ✅ `sdk/python/` — Kein npm
- ✅ `examples/typescript/package.json` — Nur `@dograh/sdk`
- ✅ `ops-dashboard/package.json` — Separates Projekt
- ✅ `evals/visualizer/package.json` — Separates Projekt
- ✅ `api/mcp_server/ts_validator/package.json` — Separates Projekt
- ✅ `deploy/helm/dograh/` — Verwendet Container-Image-Namen
- ✅ `.github/workflows/` — Verwendet Ordnerpfad `ui/`
- ✅ `docker-compose*.yaml` — Verwendet Container-Image-Namen
- ✅ `ui/Dockerfile` — Verwendet lokale Pfade
