from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from api.mcp_server.auth import (
    _looks_like_api_key,
    authenticate_mcp_request,
)


@pytest.mark.asyncio
async def test_authenticate_mcp_request_accepts_bearer_api_key():
    """Bearer with dgr_ prefix is still treated as an API key (backward compat)."""
    user = MagicMock()
    user.id = 1
    user.selected_organization_id = 90

    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={"authorization": "Bearer dgr_secret-api-key"},
        ) as get_headers,
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(return_value=user),
        ) as get_user,
    ):
        authed = await authenticate_mcp_request()

    assert authed is user
    get_headers.assert_called_once_with(include={"authorization"})
    get_user.assert_awaited_once_with(
        authorization=None, x_api_key="dgr_secret-api-key"
    )


@pytest.mark.asyncio
async def test_authenticate_mcp_request_accepts_x_api_key():
    user = MagicMock()
    user.id = 2
    user.selected_organization_id = 91

    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={"x-api-key": "dgr_secret-api-key"},
        ) as get_headers,
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(return_value=user),
        ) as get_user,
    ):
        authed = await authenticate_mcp_request()

    assert authed is user
    get_headers.assert_called_once_with(include={"authorization"})
    get_user.assert_awaited_once_with(
        authorization=None, x_api_key="dgr_secret-api-key"
    )


@pytest.mark.asyncio
async def test_authenticate_mcp_request_accepts_stack_auth_bearer_token():
    """Non-dgr_ Bearer tokens are passed to get_user for Stack Auth / JWT."""
    user = MagicMock()
    user.id = 3
    user.selected_organization_id = 92

    stack_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.stack.token"

    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={"authorization": f"Bearer {stack_token}"},
        ) as get_headers,
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(return_value=user),
        ) as get_user,
    ):
        authed = await authenticate_mcp_request()

    assert authed is user
    get_headers.assert_called_once_with(include={"authorization"})
    get_user.assert_awaited_once_with(
        authorization=f"Bearer {stack_token}", x_api_key=None
    )


@pytest.mark.asyncio
async def test_authenticate_mcp_request_accepts_local_jwt_bearer():
    """Local JWT (AUTH_PROVIDER=local) is a non-dgr_ Bearer token via get_user."""
    user = MagicMock()
    user.id = 4
    user.selected_organization_id = 93

    local_jwt = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiI0IiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig"
    )

    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={"authorization": f"Bearer {local_jwt}"},
        ),
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(return_value=user),
        ) as get_user,
    ):
        authed = await authenticate_mcp_request()

    assert authed is user
    get_user.assert_awaited_once_with(
        authorization=f"Bearer {local_jwt}", x_api_key=None
    )


@pytest.mark.asyncio
async def test_authenticate_mcp_request_prefers_x_api_key_over_bearer():
    """X-API-Key takes precedence when both headers are present."""
    user = MagicMock()
    user.id = 5
    user.selected_organization_id = 94

    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={
                "x-api-key": "dgr_from_header",
                "authorization": "Bearer eyJ.some.jwt",
            },
        ),
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(return_value=user),
        ) as get_user,
    ):
        await authenticate_mcp_request()

    get_user.assert_awaited_once_with(
        authorization="Bearer eyJ.some.jwt", x_api_key="dgr_from_header"
    )


@pytest.mark.asyncio
async def test_authenticate_mcp_request_rejects_missing_credentials():
    with patch("api.mcp_server.auth.get_http_headers", return_value={}) as get_headers:
        with pytest.raises(HTTPException) as exc_info:
            await authenticate_mcp_request()

    assert exc_info.value.status_code == 401
    assert "Missing credentials" in str(exc_info.value.detail)
    get_headers.assert_called_once_with(include={"authorization"})


@pytest.mark.asyncio
async def test_authenticate_mcp_request_propagates_get_user_errors():
    with (
        patch(
            "api.mcp_server.auth.get_http_headers",
            return_value={"authorization": "Bearer invalid-token"},
        ),
        patch(
            "api.mcp_server.auth.get_user",
            AsyncMock(side_effect=HTTPException(status_code=401, detail="Unauthorized")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await authenticate_mcp_request()

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Unauthorized"


def test_looks_like_api_key():
    assert _looks_like_api_key("dgr_abc123") is True
    assert _looks_like_api_key("dgr_") is True
    assert _looks_like_api_key("eyJhbGciOiJIUzI1NiJ9.payload.sig") is False
    assert _looks_like_api_key("secret-api-key") is False
    assert _looks_like_api_key("") is False
