"""ASGI middleware that challenges unauthenticated MCP HTTP requests.

MCP clients that support OAuth (Grok connector, Cursor, Claude, Codex) start
the Authorization Code + PKCE flow when the MCP endpoint returns HTTP 401 with
a ``WWW-Authenticate`` header pointing at protected-resource metadata.

API-key and Bearer-token clients pass through unchanged.
"""

from __future__ import annotations

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.services.auth.mcp_oauth import oauth_enabled, www_authenticate_header


class MCPAuthChallengeMiddleware:
    """Require credentials on MCP HTTP requests when OAuth is enabled.

    - OPTIONS always passes (CORS preflight).
    - Requests with ``Authorization`` or ``X-API-Key`` pass through.
    - Other requests get ``401`` + ``WWW-Authenticate`` so the client can
      start the OAuth browser flow.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not oauth_enabled():
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        authorization = (headers.get("authorization") or "").strip()
        x_api_key = (headers.get("x-api-key") or "").strip()
        if authorization or x_api_key:
            await self.app(scope, receive, send)
            return

        body = (
            b'{"error":"unauthorized","error_description":'
            b'"Authentication required. Use OAuth (browser login) or send '
            b'X-API-Key / Authorization: Bearer <token>."}'
        )
        www = www_authenticate_header()
        response_headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"www-authenticate", www.encode("utf-8")),
            (b"cache-control", b"no-store"),
            (b"access-control-allow-origin", b"*"),
            (b"access-control-allow-headers", b"*"),
            (b"access-control-expose-headers", b"WWW-Authenticate"),
        ]

        async def send_401(message: Message) -> None:
            # Not used — we send directly below.
            await send(message)

        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": response_headers,
            }
        )
        await send({"type": "http.response.body", "body": body})
        # Silence unused
        _ = send_401
