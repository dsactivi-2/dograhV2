# Dograh MCP — role in the optimization loop

## What MCP is for

Dograh’s MCP server (when enabled on your Dograh instance) lets coding agents:

- Inspect workflow definitions / nodes  
- Draft prompt or graph changes  
- Prepare publish candidates **for a human**

It is **not** wired into this ops dashboard runtime. This app stays **read-only** against the public REST API.

## How to use with Optimize P0

1. On `/optimize`, identify weak node (drop-off + tags).  
2. Open a few worst runs + Langfuse.  
3. In Cursor/Claude/etc. with Dograh MCP connected, ask for a **draft-only** prompt fix for that node.  
4. Review in Dograh UI → publish when safe.  
5. Re-sample on `/optimize` after enough new calls.

## What we deliberately do not automate

- Auto-publish to production  
- Silent prompt rewrites from the dashboard  
- Writing scores back into Dograh without product support

## Future (P5)

Optional “Suggest fix” button that:

1. Packages node prompt + failing excerpts  
2. Calls an LLM (or invokes MCP via a dev script)  
3. Shows a markdown diff for copy/paste  

Still human-gated for publish.
