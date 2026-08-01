"""HTTP routes for MCP OAuth 2.1 (authorize / token / register / discovery)."""

from __future__ import annotations

import base64
import html
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Form, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from loguru import logger

from api.db import db_client
from api.services.auth.mcp_oauth import (
    MCP_OAUTH_SCOPES,
    OAUTH_PATH,
    authorization_server_metadata,
    authorization_server_metadata_url,
    build_redirect,
    create_authorization_code,
    exchange_authorization_code,
    exchange_refresh_token,
    is_redirect_uri_allowed,
    issuer_url,
    mcp_resource_url,
    oauth_enabled,
    protected_resource_metadata,
    protected_resource_metadata_url,
    public_base_url,
    register_client,
    store,
)
from api.utils.auth import verify_password

# Operational OAuth endpoints under /api/v1/oauth/*
router = APIRouter(prefix="/oauth", tags=["mcp-oauth"])

# Root-level RFC 8414 / RFC 9728 discovery (must be mounted without API prefix)
well_known_router = APIRouter(tags=["mcp-oauth-discovery"])


def _cors_json(data: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        content=data,
        status_code=status_code,
        headers={
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
    )


def _oauth_error(error: str, description: str, status_code: int = 400) -> JSONResponse:
    return _cors_json(
        {"error": error, "error_description": description},
        status_code=status_code,
    )


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


@router.get("/.well-known/oauth-authorization-server")
@router.get("/.well-known/openid-configuration")
async def oauth_metadata_under_issuer() -> JSONResponse:
    """OIDC-style discovery under the issuer path (client fallback)."""
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    return _cors_json(authorization_server_metadata())


@router.get("/.well-known/oauth-protected-resource")
async def protected_resource_under_issuer() -> JSONResponse:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    return _cors_json(protected_resource_metadata())


@router.options("/.well-known/oauth-authorization-server")
@router.options("/.well-known/openid-configuration")
@router.options("/.well-known/oauth-protected-resource")
@router.options("/register")
@router.options("/token")
@router.options("/authorize")
async def oauth_options() -> Response:
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
    )


# Path-aware well-known at host root (RFC 8414 / RFC 9728).
# Clients discover: /.well-known/oauth-authorization-server/api/v1/oauth
# and: /.well-known/oauth-protected-resource/api/v1/mcp


@well_known_router.get("/.well-known/oauth-authorization-server")
@well_known_router.get("/.well-known/oauth-authorization-server{path:path}")
@well_known_router.get("/.well-known/openid-configuration")
@well_known_router.get("/.well-known/openid-configuration{path:path}")
async def well_known_as_metadata(path: str = "") -> JSONResponse:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    # Accept root and path-aware variants for our issuer path.
    if path and path.rstrip("/") not in ("", OAUTH_PATH.rstrip("/"), OAUTH_PATH):
        # Still return our metadata if the path points at our issuer — clients
        # sometimes append trailing slashes or slightly different paths.
        normalized = path if path.startswith("/") else f"/{path}"
        if not normalized.rstrip("/").endswith(OAUTH_PATH.rstrip("/")):
            # Be permissive: this host only has one AS.
            logger.debug("AS metadata request for path {}", path)
    return _cors_json(authorization_server_metadata())


@well_known_router.get("/.well-known/oauth-protected-resource")
@well_known_router.get("/.well-known/oauth-protected-resource{path:path}")
async def well_known_resource_metadata(path: str = "") -> JSONResponse:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    return _cors_json(protected_resource_metadata())


@well_known_router.options("/.well-known/oauth-authorization-server")
@well_known_router.options("/.well-known/oauth-authorization-server{path:path}")
@well_known_router.options("/.well-known/openid-configuration")
@well_known_router.options("/.well-known/openid-configuration{path:path}")
@well_known_router.options("/.well-known/oauth-protected-resource")
@well_known_router.options("/.well-known/oauth-protected-resource{path:path}")
async def well_known_options(path: str = "") -> Response:
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
    )


# ---------------------------------------------------------------------------
# Dynamic Client Registration
# ---------------------------------------------------------------------------


@router.post("/register")
async def dynamic_client_registration(request: Request) -> JSONResponse:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    try:
        body = await request.json()
    except Exception:
        return _oauth_error("invalid_client_metadata", "JSON body required")
    try:
        client = await register_client(body if isinstance(body, dict) else {})
    except ValueError as exc:
        return _oauth_error("invalid_client_metadata", str(exc))

    payload: dict[str, Any] = {
        "client_id": client.client_id,
        "client_id_issued_at": int(__import__("time").time()),
        "redirect_uris": client.redirect_uris,
        "grant_types": client.grant_types,
        "response_types": client.response_types,
        "token_endpoint_auth_method": client.token_endpoint_auth_method,
        "scope": client.scope,
    }
    if client.client_name:
        payload["client_name"] = client.client_name
    if client.client_secret:
        payload["client_secret"] = client.client_secret
    return _cors_json(payload, status_code=201)


# ---------------------------------------------------------------------------
# Authorize (browser login + consent)
# ---------------------------------------------------------------------------


def _render_login_page(
    *,
    client_id: str,
    redirect_uri: str,
    state: str | None,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
    client_name: str | None,
    error: str | None = None,
) -> str:
    title = "Connect to Dograh"
    app_name = html.escape(client_name or "MCP client")
    err_html = (
        f'<div class="err">{html.escape(error)}</div>' if error else ""
    )
    scopes = html.escape(scope or "mcp")
    base = html.escape(public_base_url())
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title}</title>
  <style>
    :root {{
      --bg: #0b1220;
      --card: #121a2b;
      --text: #e8eefc;
      --muted: #9fb0d0;
      --accent: #3b82f6;
      --accent2: #2563eb;
      --border: #243049;
      --err: #fecaca;
      --err-bg: #450a0a;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #1e3a8a55, transparent),
                  radial-gradient(900px 500px at 100% 0%, #0ea5e933, transparent), var(--bg);
      color: var(--text); display: flex; align-items: center; justify-content: center; padding: 24px;
    }}
    .card {{
      width: 100%; max-width: 420px; background: color-mix(in srgb, var(--card) 92%, transparent);
      border: 1px solid var(--border); border-radius: 16px; padding: 28px 26px 24px;
      box-shadow: 0 20px 50px #0008;
    }}
    h1 {{ margin: 0 0 6px; font-size: 1.35rem; letter-spacing: -0.02em; }}
    p.sub {{ margin: 0 0 20px; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }}
    label {{ display: block; font-size: 0.8rem; color: var(--muted); margin: 12px 0 6px; }}
    input {{
      width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border);
      background: #0a1020; color: var(--text); font-size: 0.95rem;
    }}
    input:focus {{ outline: 2px solid #3b82f666; border-color: var(--accent); }}
    .scopes {{
      margin: 16px 0 8px; padding: 12px; border-radius: 10px; border: 1px solid var(--border);
      background: #0a1020; font-size: 0.85rem; color: var(--muted);
    }}
    .scopes strong {{ color: var(--text); }}
    button {{
      width: 100%; margin-top: 18px; padding: 12px 14px; border: 0; border-radius: 10px;
      background: linear-gradient(180deg, var(--accent), var(--accent2)); color: white;
      font-weight: 600; font-size: 0.95rem; cursor: pointer;
    }}
    button:hover {{ filter: brightness(1.06); }}
    .err {{
      margin-bottom: 14px; padding: 10px 12px; border-radius: 10px;
      background: var(--err-bg); color: var(--err); font-size: 0.9rem;
    }}
    .foot {{ margin-top: 16px; font-size: 0.75rem; color: var(--muted); text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p class="sub"><strong>{app_name}</strong> wants to access your Dograh workspace via MCP.</p>
    {err_html}
    <form method="post" action="{html.escape(OAUTH_PATH)}/authorize">
      <input type="hidden" name="client_id" value="{html.escape(client_id)}"/>
      <input type="hidden" name="redirect_uri" value="{html.escape(redirect_uri)}"/>
      <input type="hidden" name="state" value="{html.escape(state or '')}"/>
      <input type="hidden" name="scope" value="{html.escape(scope)}"/>
      <input type="hidden" name="code_challenge" value="{html.escape(code_challenge)}"/>
      <input type="hidden" name="code_challenge_method" value="{html.escape(code_challenge_method)}"/>
      <input type="hidden" name="response_type" value="code"/>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus/>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required/>
      <div class="scopes">
        <strong>Permissions</strong><br/>
        Scope: <code>{scopes}</code><br/>
        Resource: <code>{html.escape(mcp_resource_url())}</code>
      </div>
      <button type="submit">Sign in & Allow</button>
    </form>
    <div class="foot">Dograh · {base}</div>
  </div>
</body>
</html>"""


@router.get("/authorize", response_class=HTMLResponse)
async def authorize_get(
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    state: str | None = Query(None),
    scope: str | None = Query(None),
    code_challenge: str | None = Query(None),
    code_challenge_method: str = Query("S256"),
) -> HTMLResponse:
    if not oauth_enabled():
        raise HTTPException(
            status_code=404,
            detail="Browser OAuth is only available when AUTH_PROVIDER=local",
        )
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Only response_type=code is supported")
    if not code_challenge:
        raise HTTPException(status_code=400, detail="code_challenge (PKCE) is required")
    if code_challenge_method.upper() != "S256":
        raise HTTPException(status_code=400, detail="Only S256 PKCE is supported")

    client = await store.get_client(client_id)
    if client is None:
        # Allow first-time public clients that registered dynamically; if unknown,
        # still show a clear error (MCP clients should register first).
        return HTMLResponse(
            _render_login_page(
                client_id=client_id,
                redirect_uri=redirect_uri,
                state=state,
                scope=scope or " ".join(MCP_OAUTH_SCOPES),
                code_challenge=code_challenge,
                code_challenge_method=code_challenge_method,
                client_name=None,
                error="Unknown client_id. The MCP client must register first.",
            ),
            status_code=400,
        )
    if not is_redirect_uri_allowed(client, redirect_uri):
        raise HTTPException(status_code=400, detail="redirect_uri not registered for this client")

    return HTMLResponse(
        _render_login_page(
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            scope=scope or client.scope or " ".join(MCP_OAUTH_SCOPES),
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            client_name=client.client_name,
        )
    )


@router.post("/authorize")
async def authorize_post(
    email: str = Form(...),
    password: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    code_challenge: str = Form(...),
    code_challenge_method: str = Form("S256"),
    state: str | None = Form(None),
    scope: str | None = Form(None),
    response_type: str = Form("code"),
) -> Response:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Only response_type=code is supported")

    client = await store.get_client(client_id)
    if client is None:
        return HTMLResponse(
            _render_login_page(
                client_id=client_id,
                redirect_uri=redirect_uri,
                state=state,
                scope=scope or "mcp",
                code_challenge=code_challenge,
                code_challenge_method=code_challenge_method,
                client_name=None,
                error="Unknown client_id.",
            ),
            status_code=400,
        )
    if not is_redirect_uri_allowed(client, redirect_uri):
        raise HTTPException(status_code=400, detail="redirect_uri not registered for this client")

    user = await db_client.get_user_by_email(email)
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        return HTMLResponse(
            _render_login_page(
                client_id=client_id,
                redirect_uri=redirect_uri,
                state=state,
                scope=scope or client.scope or "mcp",
                code_challenge=code_challenge,
                code_challenge_method=code_challenge_method,
                client_name=client.client_name,
                error="Invalid email or password.",
            ),
            status_code=401,
        )

    scopes = (scope or client.scope or "mcp").split()
    code = await create_authorization_code(
        client=client,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        scopes=scopes,
        user_id=user.id,
        email=user.email or email,
    )
    target = build_redirect(redirect_uri, code=code, state=state)
    return RedirectResponse(url=target, status_code=302)


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------


async def _authenticate_client(request: Request, form: dict[str, str]) -> Any:
    client_id = form.get("client_id")
    client_secret = form.get("client_secret")

    # client_secret_basic
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("basic "):
        try:
            decoded = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
            basic_id, basic_secret = decoded.split(":", 1)
            client_id = client_id or basic_id
            client_secret = client_secret or basic_secret
        except Exception:
            return None, _oauth_error("invalid_client", "Invalid Basic auth", 401)

    if not client_id:
        return None, _oauth_error("invalid_client", "client_id required", 401)

    client = await store.get_client(client_id)
    if client is None:
        return None, _oauth_error("invalid_client", "Unknown client_id", 401)

    if client.token_endpoint_auth_method != "none":
        if not client_secret or client_secret != client.client_secret:
            return None, _oauth_error("invalid_client", "Invalid client credentials", 401)

    return client, None


@router.post("/token")
async def token_endpoint(request: Request) -> JSONResponse:
    if not oauth_enabled():
        raise HTTPException(status_code=404, detail="OAuth not enabled")

    content_type = request.headers.get("content-type", "")
    form: dict[str, str] = {}
    if "application/x-www-form-urlencoded" in content_type:
        raw = (await request.body()).decode("utf-8")
        parsed = parse_qs(raw, keep_blank_values=True)
        form = {k: (v[0] if v else "") for k, v in parsed.items()}
    elif "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                form = {str(k): str(v) if v is not None else "" for k, v in body.items()}
        except Exception:
            return _oauth_error("invalid_request", "Invalid JSON body")
    else:
        # Try form parse as fallback
        try:
            form_data = await request.form()
            form = {str(k): str(v) for k, v in form_data.items()}
        except Exception:
            return _oauth_error("invalid_request", "Expected form body")

    client, err = await _authenticate_client(request, form)
    if err is not None:
        return err

    grant_type = form.get("grant_type")
    try:
        if grant_type == "authorization_code":
            code = form.get("code") or ""
            redirect_uri = form.get("redirect_uri") or ""
            code_verifier = form.get("code_verifier") or ""
            if not code or not redirect_uri or not code_verifier:
                return _oauth_error(
                    "invalid_request",
                    "code, redirect_uri, and code_verifier are required",
                )
            token = await exchange_authorization_code(
                client=client,
                code=code,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
            )
            return _cors_json(token)
        if grant_type == "refresh_token":
            refresh = form.get("refresh_token") or ""
            if not refresh:
                return _oauth_error("invalid_request", "refresh_token required")
            scope = form.get("scope")
            scopes = scope.split() if scope else None
            token = await exchange_refresh_token(
                client=client, refresh_token=refresh, scopes=scopes
            )
            return _cors_json(token)
        return _oauth_error("unsupported_grant_type", f"Unsupported grant_type: {grant_type}")
    except ValueError as exc:
        msg = str(exc)
        if msg == "invalid_scope":
            return _oauth_error("invalid_scope", "Requested scopes exceed grant")
        # MCP clients treat invalid_grant as 401
        return _oauth_error("invalid_grant", msg, status_code=401)


# ---------------------------------------------------------------------------
# Debug / health helpers (safe, no secrets)
# ---------------------------------------------------------------------------


@router.get("/status")
async def oauth_status() -> JSONResponse:
    return _cors_json(
        {
            "enabled": oauth_enabled(),
            "issuer": issuer_url() if oauth_enabled() else None,
            "authorization_server_metadata": (
                authorization_server_metadata_url() if oauth_enabled() else None
            ),
            "protected_resource_metadata": (
                protected_resource_metadata_url() if oauth_enabled() else None
            ),
            "mcp_resource": mcp_resource_url(),
            "scopes": MCP_OAUTH_SCOPES,
        }
    )
