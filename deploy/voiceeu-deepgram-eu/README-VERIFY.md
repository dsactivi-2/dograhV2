# Deepgram EU — Preflight + Verify (voiceeu)

## Order

```bash
# on the server, as root (or docker group)
cd /path/where/you/copied/these/scripts

# 1) READ-ONLY discovery — paths, containers, code locations
sudo bash 00_preflight_discover.sh

# 2) inspect
less preflight-report.md
cat preflight-report.env

# 3) after (or before) deploy — verification
sudo bash 04_verify_deepgram_eu.sh
echo $?   # 0 = PASS, 1 = FAIL
less verify-report.md
```

## Outputs

| File | Purpose |
|------|---------|
| `preflight-report.env` | KEY=value for verify |
| `preflight-report.md` | human report |
| `preflight-report.json` | same as env JSON |
| `verify-report.md` | PASS/FAIL table |
| `verify-report.env` | VERIFY_OK=yes/no |

## Notes

- Both scripts are **read-only** (no compose up, no image change).
- Verify loads `preflight-report.env` automatically from the same directory.
- If preflight was not run, verify still tries to find the API container + code paths.
- Expected EU host: `api.eu.deepgram.com`
