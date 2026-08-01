"""Tests for MCP OAuth 2.1 (Authorization Code + PKCE) helpers."""

from __future__ import annotations

import base64
import hashlib
import secrets
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.services.auth import mcp_oauth as oauth


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def test_verify_pkce_s256():
    verifier, challenge = _pkce_pair()
    assert oauth.verify_pkce(verifier, challenge, "S256")
    assert not oauth.verify_pkce(verifier + "x", challenge, "S256")
    assert not oauth.verify_pkce(verifier, challenge, "plain")


def test_www_authenticate_header_contains_resource_metadata():
    header = oauth.www_authenticate_header()
    # Challenge must point clients at protected-resource metadata (RFC 9728).
    assert header.startswith("Bearer ")
    assert "oauth-protected-resource" in header
    assert "/api/v1/mcp" in header
    assert "scope=" in header
    # Split the parameter name so CI log redaction cannot hide the match.
    assert "resource_" + "metadata" in header


@pytest.mark.asyncio
async def test_register_and_code_exchange_roundtrip():
    # Force in-memory store (no real Redis)
    store = oauth.McpOAuthStore()
    store._redis = None
    store._memory = {}

    with patch.object(oauth, "store", store), patch.object(
        oauth, "create_jwt_token", return_value="jwt-for-user-7"
    ), patch.object(oauth, "OSS_JWT_EXPIRY_HOURS", 24):
        client = await oauth.register_client(
            {
                "redirect_uris": ["https://client.example/callback"],
                "client_name": "Grok",
                "token_endpoint_auth_method": "none",
            }
        )
        assert client.client_id.startswith("mcp_client_")
        assert client.client_secret is None

        verifier, challenge = _pkce_pair()
        code = await oauth.create_authorization_code(
            client=client,
            redirect_uri="https://client.example/callback",
            code_challenge=challenge,
            code_challenge_method="S256",
            scopes=["mcp"],
            user_id=7,
            email="user@example.com",
        )
        token = await oauth.exchange_authorization_code(
            client=client,
            code=code,
            redirect_uri="https://client.example/callback",
            code_verifier=verifier,
        )
        assert token["access_token"] == "jwt-for-user-7"
        assert token["token_type"] == "Bearer"
        assert token["refresh_token"]
        assert token["scope"] == "mcp"

        # code is single-use
        with pytest.raises(ValueError, match="invalid_grant"):
            await oauth.exchange_authorization_code(
                client=client,
                code=code,
                redirect_uri="https://client.example/callback",
                code_verifier=verifier,
            )

        # refresh rotates
        refreshed = await oauth.exchange_refresh_token(
            client=client, refresh_token=token["refresh_token"]
        )
        assert refreshed["access_token"] == "jwt-for-user-7"
        assert refreshed["refresh_token"] != token["refresh_token"]


@pytest.mark.asyncio
async def test_pkce_mismatch_rejected():
    store = oauth.McpOAuthStore()
    store._redis = None
    store._memory = {}
    with patch.object(oauth, "store", store), patch.object(
        oauth, "create_jwt_token", return_value="jwt"
    ):
        client = await oauth.register_client(
            {"redirect_uris": ["https://cb.example/x"], "token_endpoint_auth_method": "none"}
        )
        _, challenge = _pkce_pair()
        code = await oauth.create_authorization_code(
            client=client,
            redirect_uri="https://cb.example/x",
            code_challenge=challenge,
            code_challenge_method="S256",
            scopes=["mcp"],
            user_id=1,
            email="a@b.c",
        )
        with pytest.raises(ValueError, match="invalid_grant"):
            await oauth.exchange_authorization_code(
                client=client,
                code=code,
                redirect_uri="https://cb.example/x",
                code_verifier="definitely-wrong-verifier-value-xxxxxx",
            )


def test_metadata_shapes():
    meta = oauth.authorization_server_metadata()
    assert meta["issuer"].endswith("/api/v1/oauth")
    assert meta["authorization_endpoint"].endswith("/authorize")
    assert meta["token_endpoint"].endswith("/token")
    assert meta["registration_endpoint"].endswith("/register")
    assert "S256" in meta["code_challenge_methods_supported"]

    prm = oauth.protected_resource_metadata()
    assert prm["resource"].endswith("/api/v1/mcp")
    assert prm["authorization_servers"][0].endswith("/api/v1/oauth")
    assert "mcp" in prm["scopes_supported"]


@pytest.mark.asyncio
async def test_middleware_challenges_without_credentials():
    from api.mcp_server.oauth_middleware import MCPAuthChallengeMiddleware

    called = {"ok": False}

    async def inner(scope, receive, send):
        called["ok"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = MCPAuthChallengeMiddleware(inner)
    messages = []

    async def send(msg):
        messages.append(msg)

    async def receive():
        return {"type": "http.disconnect"}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [],
    }
    with patch("api.mcp_server.oauth_middleware.oauth_enabled", return_value=True):
        await mw(scope, receive, send)

    assert called["ok"] is False
    assert messages[0]["status"] == 401
    headers = dict(messages[0]["headers"])
    assert b"www-authenticate" in headers
    www = headers[b"www-authenticate"]
    assert b"oauth-protected-resource" in www
    assert b"resource_" + b"metadata" in www


@pytest.mark.asyncio
async def test_middleware_passes_with_api_key():
    from api.mcp_server.oauth_middleware import MCPAuthChallengeMiddleware

    called = {"ok": False}

    async def inner(scope, receive, send):
        called["ok"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = MCPAuthChallengeMiddleware(inner)
    messages = []

    async def send(msg):
        messages.append(msg)

    async def receive():
        return {"type": "http.disconnect"}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [(b"x-api-key", b"dgr_test")],
    }
    with patch("api.mcp_server.oauth_middleware.oauth_enabled", return_value=True):
        await mw(scope, receive, send)

    assert called["ok"] is True
    assert messages[0]["status"] == 200
