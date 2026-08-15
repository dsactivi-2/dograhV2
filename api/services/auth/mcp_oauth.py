"""MCP OAuth 2.1 Authorization Server (Authorization Code + PKCE).

Implements the browser login / consent flow that MCP clients (Grok connector,
Cursor, Claude, Codex) expect when the user only pastes the MCP endpoint URL:

1. Client hits the MCP endpoint without credentials → HTTP 401 +
   ``WWW-Authenticate: Bearer resource_metadata="…"``
2. Client fetches Protected Resource Metadata (RFC 9728)
3. Client fetches Authorization Server Metadata (RFC 8414)
4. Optional Dynamic Client Registration (RFC 7591)
5. Browser redirect to ``/api/v1/oauth/authorize`` → user logs in + consents
6. Authorization code → token endpoint (PKCE S256) → access token
7. Client retries MCP with ``Authorization: Bearer <access_token>``

Access tokens are Dograh local JWTs (same as ``POST /api/v1/auth/login``) so
``get_user()`` / ``authenticate_mcp_request()`` keep working unchanged.

Storage is Redis-backed (multi-worker safe) with an in-process fallback for
tests / Redis outages.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlencode, urlparse

import redis.asyncio as aioredis
from loguru import logger

from api.constants import (
    AUTH_PROVIDER,
    BACKEND_API_ENDPOINT,
    OSS_JWT_EXPIRY_HOURS,
    REDIS_URL,
)
from api.utils.auth import create_jwt_token

# ---------------------------------------------------------------------------
# Public constants / URL helpers
# ---------------------------------------------------------------------------

MCP_OAUTH_SCOPES = ["mcp"]
API_PREFIX = "/api/v1"
OAUTH_PATH = f"{API_PREFIX}/oauth"
MCP_PATH = f"{API_PREFIX}/mcp"

AUTH_CODE_TTL_SECONDS = 5 * 60
CLIENT_TTL_SECONDS = 90 * 24 * 3600  # 90 days
REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 days

_REDIS_PREFIX = "dograh:mcp_oauth:"


def public_base_url() -> str:
    """Canonical public origin for this deployment (no trailing slash)."""
    return (BACKEND_API_ENDPOINT or "http://localhost:8000").rstrip("/")


def issuer_url() -> str:
    return f"{public_base_url()}{OAUTH_PATH}"


def mcp_resource_url() -> str:
    # No trailing slash — RFC 9728 resource identifiers are typically without.
    return f"{public_base_url()}{MCP_PATH}"


def protected_resource_metadata_url() -> str:
    """RFC 9728 path-aware well-known URL for the MCP resource."""
    base = public_base_url()
    return f"{base}/.well-known/oauth-protected-resource{MCP_PATH}"


def authorization_server_metadata_url() -> str:
    """RFC 8414 path-aware well-known URL for this issuer."""
    base = public_base_url()
    path = OAUTH_PATH.rstrip("/")
    return f"{base}/.well-known/oauth-authorization-server{path}"


def oauth_enabled() -> bool:
    """Browser OAuth flow is available for local (email/password) auth."""
    return AUTH_PROVIDER == "local"


def www_authenticate_header() -> str:
    meta = protected_resource_metadata_url()
    return f'Bearer FAKESECRET_g3h4i5j6k7l8m9n0o1p2="{meta}", scope="mcp"'


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class OAuthClient:
    client_id: str
    client_secret: str | None
    redirect_uris: list[str]
    client_name: str | None
    token_endpoint_auth_method: str
    grant_types: list[str]
    response_types: list[str]
    scope: str


@dataclass
class AuthorizationCodeRecord:
    code: str
    client_id: str
    redirect_uri: str
    code_challenge: str
    code_challenge_method: str
    scopes: list[str]
    user_id: int
    email: str
    expires_at: float
    redirect_uri_provided_explicitly: bool = True


@dataclass
class RefreshTokenRecord:
    token: str
    client_id: str
    user_id: int
    email: str
    scopes: list[str]
    expires_at: float


# ---------------------------------------------------------------------------
# Store (Redis + memory fallback)
# ---------------------------------------------------------------------------


class McpOAuthStore:
    """Async store for OAuth clients, auth codes, and refresh tokens."""

    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None
        self._memory: dict[str, str] = {}

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis is not None:
            return self._redis
        try:
            client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await client.ping()
            self._redis = client
            return client
        except Exception as exc:  # pragma: no cover - exercised when Redis down
            logger.warning("MCP OAuth store using in-memory fallback: {}", exc)
            return None

    async def _set(self, key: str, value: dict[str, Any], ttl: int | None) -> None:
        payload = json.dumps(value)
        redis = await self._get_redis()
        full = f"{_REDIS_PREFIX}{key}"
        if redis is not None:
            if ttl:
                await redis.set(full, payload, ex=ttl)
            else:
                await redis.set(full, payload)
            return
        self._memory[full] = payload

    async def _get(self, key: str) -> dict[str, Any] | None:
        full = f"{_REDIS_PREFIX}{key}"
        redis = await self._get_redis()
        raw: str | None
        if redis is not None:
            raw = await redis.get(full)
        else:
            raw = self._memory.get(full)
        if not raw:
            return None
        return json.loads(raw)

    async def _delete(self, key: str) -> None:
        full = f"{_REDIS_PREFIX}{key}"
        redis = await self._get_redis()
        if redis is not None:
            await redis.delete(full)
        else:
            self._memory.pop(full, None)

    # -- clients -------------------------------------------------------------

    async def save_client(self, client: OAuthClient) -> None:
        await self._set(
            f"client:{client.client_id}", asdict(client), CLIENT_TTL_SECONDS
        )

    async def get_client(self, client_id: str) -> OAuthClient | None:
        data = await self._get(f"client:{client_id}")
        if not data:
            return None
        return OAuthClient(**data)

    # -- auth codes ----------------------------------------------------------

    async def save_auth_code(self, record: AuthorizationCodeRecord) -> None:
        ttl = max(1, int(record.expires_at - time.time()))
        await self._set(f"code:{record.code}", asdict(record), ttl)

    async def consume_auth_code(self, code: str) -> AuthorizationCodeRecord | None:
        data = await self._get(f"code:{code}")
        if not data:
            return None
        await self._delete(f"code:{code}")
        record = AuthorizationCodeRecord(**data)
        if record.expires_at < time.time():
            return None
        return record

    # -- refresh tokens ------------------------------------------------------

    async def save_refresh_token(self, record: RefreshTokenRecord) -> None:
        ttl = max(1, int(record.expires_at - time.time()))
        await self._set(f"refresh:{record.token}", asdict(record), ttl)

    async def get_refresh_token(self, token: str) -> RefreshTokenRecord | None:
        data = await self._get(f"refresh:{token}")
        if not data:
            return None
        record = RefreshTokenRecord(**data)
        if record.expires_at < time.time():
            await self._delete(f"refresh:{token}")
            return None
        return record

    async def delete_refresh_token(self, token: str) -> None:
        await self._delete(f"refresh:{token}")


store = McpOAuthStore()


# ---------------------------------------------------------------------------
# PKCE + helpers
# ---------------------------------------------------------------------------


def verify_pkce(code_verifier: str, code_challenge: str, method: str) -> bool:
    if method.upper() != "S256":
        return False
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return secrets.compare_digest(computed, code_challenge)


def _new_token(prefix: str = "") -> str:
    return f"{prefix}{secrets.token_urlsafe(32)}"


def is_redirect_uri_allowed(client: OAuthClient, redirect_uri: str) -> bool:
    if redirect_uri in client.redirect_uris:
        return True
    # Allow exact match only — no wildcards.
    return False


def build_redirect(redirect_uri: str, **params: str | None) -> str:
    clean = {k: v for k, v in params.items() if v is not None}
    sep = "&" if urlparse(redirect_uri).query else "?"
    return f"{redirect_uri}{sep}{urlencode(clean)}"


# ---------------------------------------------------------------------------
# Registration / authorize / token
# ---------------------------------------------------------------------------


async def register_client(body: dict[str, Any]) -> OAuthClient:
    redirect_uris = body.get("redirect_uris") or []
    if not isinstance(redirect_uris, list) or not redirect_uris:
        raise ValueError("redirect_uris is required")
    for uri in redirect_uris:
        if not isinstance(uri, str) or not uri:
            raise ValueError("invalid redirect_uri")

    auth_method = body.get("token_endpoint_auth_method") or "none"
    if auth_method not in ("none", "client_secret_post", "client_secret_basic"):
        auth_method = "none"

    client_id = _new_token("mcp_client_")
    client_secret = None if auth_method == "none" else _new_token("mcp_secret_")

    grant_types = body.get("grant_types") or ["authorization_code", "refresh_token"]
    response_types = body.get("response_types") or ["code"]
    scope = body.get("scope") or " ".join(MCP_OAUTH_SCOPES)

    client = OAuthClient(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uris=list(redirect_uris),
        client_name=body.get("client_name"),
        token_endpoint_auth_method=auth_method,
        grant_types=list(grant_types),
        response_types=list(response_types),
        scope=scope if isinstance(scope, str) else " ".join(scope),
    )
    await store.save_client(client)
    return client


async def create_authorization_code(
    *,
    client: OAuthClient,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str,
    scopes: list[str],
    user_id: int,
    email: str,
) -> str:
    code = _new_token("mcp_code_")
    record = AuthorizationCodeRecord(
        code=code,
        client_id=client.client_id,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method or "S256",
        scopes=scopes or list(MCP_OAUTH_SCOPES),
        user_id=user_id,
        email=email,
        expires_at=time.time() + AUTH_CODE_TTL_SECONDS,
    )
    await store.save_auth_code(record)
    return code


async def exchange_authorization_code(
    *,
    client: OAuthClient,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, Any]:
    record = await store.consume_auth_code(code)
    if record is None:
        raise ValueError("invalid_grant")
    if record.client_id != client.client_id:
        raise ValueError("invalid_grant")
    if record.redirect_uri != redirect_uri:
        raise ValueError("invalid_grant")
    if not verify_pkce(
        code_verifier, record.code_challenge, record.code_challenge_method
    ):
        raise ValueError("invalid_grant")

    access_token = create_jwt_token(record.user_id, record.email)
    refresh = _new_token("mcp_rt_")
    await store.save_refresh_token(
        RefreshTokenRecord(
            token=refresh,
            client_id=client.client_id,
            user_id=record.user_id,
            email=record.email,
            scopes=record.scopes,
            expires_at=time.time() + REFRESH_TOKEN_TTL_SECONDS,
        )
    )
    expires_in = int(OSS_JWT_EXPIRY_HOURS * 3600)
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "refresh_token": refresh,
        "scope": " ".join(record.scopes),
    }


async def exchange_refresh_token(
    *,
    client: OAuthClient,
    refresh_token: str,
    scopes: list[str] | None = None,
) -> dict[str, Any]:
    record = await store.get_refresh_token(refresh_token)
    if record is None or record.client_id != client.client_id:
        raise ValueError("invalid_grant")

    requested = scopes or record.scopes
    if not set(requested).issubset(set(record.scopes)):
        raise ValueError("invalid_scope")

    # Rotate refresh token
    await store.delete_refresh_token(refresh_token)
    new_refresh = _new_token("mcp_rt_")
    await store.save_refresh_token(
        RefreshTokenRecord(
            token=new_refresh,
            client_id=client.client_id,
            user_id=record.user_id,
            email=record.email,
            scopes=list(requested),
            expires_at=time.time() + REFRESH_TOKEN_TTL_SECONDS,
        )
    )
    access_token = create_jwt_token(record.user_id, record.email)
    expires_in = int(OSS_JWT_EXPIRY_HOURS * 3600)
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "refresh_token": new_refresh,
        "scope": " ".join(requested),
    }


def authorization_server_metadata() -> dict[str, Any]:
    issuer = issuer_url()
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/authorize",
        "token_endpoint": f"{issuer}/token",
        "registration_endpoint": f"{issuer}/register",
        "scopes_supported": MCP_OAUTH_SCOPES,
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": [
            "none",
            "client_secret_post",
            "client_secret_basic",
        ],
        "code_challenge_methods_supported": ["S256"],
        "service_documentation": f"{public_base_url()}/docs",
    }


def protected_resource_metadata() -> dict[str, Any]:
    return {
        "resource": mcp_resource_url(),
        "authorization_servers": [issuer_url()],
        "scopes_supported": MCP_OAUTH_SCOPES,
        "bearer_methods_supported": ["header"],
        "resource_name": "Dograh MCP Server",
        "resource_documentation": f"{public_base_url()}/docs",
    }
