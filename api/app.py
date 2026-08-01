"""Set up logging before importing anything else"""

import sentry_sdk

from api.constants import (
    CORS_ALLOWED_ORIGINS,
    DEPLOYMENT_MODE,
    ENABLE_TELEMETRY,
    SENTRY_DSN,
)
from api.logging_config import ENVIRONMENT, setup_logging

# Set up logging and get the listener for cleanup
setup_logging()


if SENTRY_DSN and (
    DEPLOYMENT_MODE != "oss" or (DEPLOYMENT_MODE == "oss" and ENABLE_TELEMETRY)
):
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        send_default_pii=True,
        environment=ENVIRONMENT,
    )
    print(f"Sentry initialized in environment: {ENVIRONMENT}")


from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from api.constants import REDIS_URL
from api.mcp_server import mcp
from api.mcp_server.oauth_middleware import MCPAuthChallengeMiddleware
from api.routes.main import router as main_router
from api.routes.mcp_oauth import router as mcp_oauth_router
from api.routes.mcp_oauth import well_known_router as mcp_oauth_well_known_router
from api.services.pipecat.tracing_config import (
    handle_langfuse_sync,
    load_all_org_langfuse_credentials,
)
from api.services.worker_sync.manager import (
    WorkerSyncManager,
    set_worker_sync_manager,
)
from api.services.worker_sync.protocol import WorkerSyncEventType
from api.tasks.arq import get_arq_redis

API_PREFIX = "/api/v1"

mcp_app = mcp.http_app(path="/", stateless_http=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_app.lifespan(app):
        # warmup arq pool
        await get_arq_redis()

        # Pre-register all org-specific Langfuse exporters so they're ready
        # before any pipeline runs, without per-call DB lookups.
        await load_all_org_langfuse_credentials()

        # Start cross-worker sync manager so config changes propagate to all workers
        sync_manager = WorkerSyncManager(REDIS_URL)
        sync_manager.register(
            WorkerSyncEventType.LANGFUSE_CREDENTIALS, handle_langfuse_sync
        )
        await sync_manager.start()
        set_worker_sync_manager(sync_manager)

        # Event-loop lag gauge — per-pod saturation signal read off
        # /health/active-calls during autoscaling load tests.
        from api.services.observability import loop_lag

        loop_lag.start()

        yield  # Run app

        # Shutdown sequence - this runs when FastAPI is shutting down
        logger.info("Starting graceful shutdown...")
        await sync_manager.stop()
        await loop_lag.stop()


app = FastAPI(
    title="Dograh API",
    description="API for the Dograh app",
    version="1.0.0",
    openapi_url=f"{API_PREFIX}/openapi.json",
    lifespan=lifespan,
    servers=[
        {"url": "https://app.dograh.com", "description": "Production"},
        {"url": "http://localhost:8000", "description": "Local development"},
    ],
)


# Configure CORS.
# OSS is typically deployed with UI and API behind a single reverse proxy
# (same-origin, so CORS does not apply). Keep it permissive without
# credentials — wildcard + credentials is rejected by browsers and unsafe.
# SaaS deployments must set CORS_ALLOWED_ORIGINS to an explicit allowlist.
if DEPLOYMENT_MODE == "oss":
    cors_origins: list[str] = ["*"]
    cors_allow_credentials = False
else:
    if not CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS must be set to an explicit origin allowlist "
            "when DEPLOYMENT_MODE != 'oss'"
        )
    if "*" in CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS cannot contain '*' with credentialed requests"
        )
    cors_origins = CORS_ALLOWED_ORIGINS
    cors_allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    # MCP OAuth clients need to read the challenge header.
    expose_headers=["WWW-Authenticate"],
)


def _add_public_embed_cors_middleware() -> None:
    from api.routes.public_embed import PublicEmbedCORSMiddleware

    app.add_middleware(PublicEmbedCORSMiddleware, api_prefix=API_PREFIX)


_add_public_embed_cors_middleware()

api_router = APIRouter()

# include subrouters here
api_router.include_router(main_router)
api_router.include_router(mcp_oauth_router)

# main router with api prefix
app.include_router(api_router, prefix=API_PREFIX)

# RFC 8414 / RFC 9728 discovery at host root so MCP clients can resolve
# /.well-known/oauth-authorization-server/api/v1/oauth and
# /.well-known/oauth-protected-resource/api/v1/mcp
# (requires reverse-proxy to route /.well-known to the API — see hostinger compose).
app.include_router(mcp_oauth_well_known_router)

# Mount the MCP server — agents reach it at /api/v1/mcp over Streamable HTTP.
# Auth:
#   1. Browser OAuth (Authorization Code + PKCE) when AUTH_PROVIDER=local
#   2. X-API-Key / Authorization: Bearer dgr_... (API key)
#   3. Authorization: Bearer <access_token> (local JWT / Stack Auth)
# Unauthenticated requests get HTTP 401 + WWW-Authenticate so connectors
# (Grok, Cursor, Claude, Codex) start the OAuth redirect flow.
# See api/mcp_server/auth.py, api/services/auth/mcp_oauth.py, docs/integrations/mcp.mdx.
app.mount(
    f"{API_PREFIX}/mcp",
    MCPAuthChallengeMiddleware(mcp_app),
)
