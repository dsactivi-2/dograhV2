"""MCP request authentication.

Supports the same credential types as the main FastAPI ``get_user`` dependency:

1. Long-lived API keys (``X-API-Key`` or ``Authorization: Bearer dgr_...``)
2. Stack Auth access tokens (``Authorization: Bearer <stack_token>``) when
   ``AUTH_PROVIDER=stack``
3. Local JWTs issued by ``POST /api/v1/auth/login`` (or ``/signup``) when
   ``AUTH_PROVIDER=local``

API-key Bearer values are detected by the ``dgr_`` prefix so existing MCP
clients that only support the Authorization header keep working.
"""

from fastapi import HTTPException
from fastmcp.server.dependencies import get_http_headers
from opentelemetry import trace

from api.db.models import UserModel
from api.services.auth.depends import get_user

# Must match the prefix used by ``api.utils.api_key.generate_api_key``.
_API_KEY_PREFIX = "dgr_"


def _extract_bearer_token(authorization: str) -> str | None:
    """Return the token portion of a Bearer authorization header, or None."""
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return token or None
    return None


def _looks_like_api_key(token: str) -> bool:
    """True when *token* matches the Dograh API-key format (``dgr_...``)."""
    return token.startswith(_API_KEY_PREFIX)


async def authenticate_mcp_request() -> UserModel:
    """Resolve the authenticated Dograh user for an MCP tool invocation.

    Credential resolution order (mirrors ``get_user``):

    1. ``X-API-Key: <key>`` — long-lived organization API key
    2. ``Authorization: Bearer dgr_...`` — same API key via Bearer
       (backward-compatible with clients that only set Authorization)
    3. ``Authorization: Bearer <token>`` — short-lived access token:
       - Stack Auth access token when ``AUTH_PROVIDER=stack``
       - Local JWT when ``AUTH_PROVIDER=local``

    FastMCP strips the Authorization header by default unless explicitly
    included. We request it here so Bearer credentials work for both
    Streamable HTTP and SSE transports.

    Tags the currently-active OTel span with the resolved organization
    and user identifiers. ``_OrgRoutingExporter`` reads ``dograh.org_id``
    at export time to dispatch the span to the right Langfuse project;
    the ``langfuse.user.id`` / ``langfuse.session.id`` attributes make the
    span filterable in the Langfuse UI.
    """
    # FastMCP strips Authorization by default unless explicitly included.
    # Preserve it here so Bearer API keys and access tokens work for MCP
    # tool invocations.
    headers = get_http_headers(include={"authorization"})
    x_api_key = (headers.get("x-api-key") or "").strip() or None
    authorization = (headers.get("authorization") or "").strip() or None

    if not x_api_key and not authorization:
        raise HTTPException(
            status_code=401,
            detail=(
                "Missing credentials — send X-API-Key, or Authorization: Bearer "
                "with an API key (dgr_...), Stack Auth access token, or local JWT"
            ),
        )

    # Authorization: Bearer dgr_... is treated as an API key so existing MCP
    # clients keep working without sending X-API-Key. Non-dgr_ Bearer values
    # are left as Authorization for Stack Auth / local JWT validation.
    auth_method = "access_token"
    if x_api_key:
        auth_method = "api_key"
    elif authorization:
        bearer = _extract_bearer_token(authorization)
        if bearer and _looks_like_api_key(bearer):
            x_api_key = bearer
            authorization = None
            auth_method = "api_key"

    # Reuse the main API auth dependency so MCP and REST share the same
    # user/org resolution, Stack Auth lookup, and local JWT validation.
    user = await get_user(authorization=authorization, x_api_key=x_api_key)

    span = trace.get_current_span()
    if span.is_recording():
        org_id = user.selected_organization_id
        # Intentionally NOT `dograh.org_id` — that attribute triggers the
        # per-org Langfuse routing for pipeline spans, and MCP traffic
        # should land in the default (developer-facing) project only.
        # Exposed under `mcp.org_id` for Langfuse UI filtering without
        # affecting the router.
        span.set_attribute("mcp.org_id", str(org_id))
        span.set_attribute("mcp.user_id", str(user.id))
        span.set_attribute("mcp.auth_method", auth_method)
        span.set_attribute("langfuse.user.id", str(user.id))

    return user
