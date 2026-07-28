"""Text-chat eval harness API (P2 core)."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pipecat.utils.run_context import set_current_run_id

from api.db import db_client
from api.db.models import UserModel
from api.enums import WorkflowRunMode
from api.schemas.text_eval import TextEvalRunResponse, TextEvalScenario
from api.services.auth.depends import get_user
from api.services.evals.text_harness import run_text_eval_scenario
from api.services.quota_service import authorize_workflow_run_start
from api.services.workflow.run_creation import prepare_workflow_run_inputs
from api.services.workflow.text_chat_session_service import (
    TextChatSessionExecutionError,
    TextChatSessionRevisionConflictError,
    append_text_chat_user_message,
    default_text_chat_checkpoint,
    default_text_chat_session_data,
    execute_pending_text_chat_turn,
    initialize_text_chat_session,
    normalize_text_chat_session_data,
)

router = APIRouter(prefix="/evals", tags=["evals"])


def _require_org(user: UserModel) -> int:
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")
    return int(user.selected_organization_id)


def _assistant_from_session(session_data: dict[str, Any]) -> str:
    """Best-effort last assistant message from text-chat session_data."""
    data = normalize_text_chat_session_data(session_data)
    turns = data.get("turns") or []
    if not isinstance(turns, list):
        return ""
    for t in reversed(turns):
        if not isinstance(t, dict):
            continue
        am = t.get("assistant_message")
        if isinstance(am, dict) and am.get("text"):
            return str(am["text"])
        if t.get("assistant_text"):
            return str(t["assistant_text"])
        role = str(t.get("role") or t.get("speaker") or "").lower()
        if role in ("assistant", "agent", "bot", "ai"):
            return str(t.get("text") or t.get("content") or t.get("message") or "")
    return str(data.get("last_assistant_text") or "")


@router.get("/health")
async def evals_health():
    return {"status": "ok", "module": "evals", "harness": "text-chat"}


@router.post("/text/run", response_model=TextEvalRunResponse)
async def run_text_eval(
    scenario: TextEvalScenario,
    user: UserModel = Depends(get_user),
) -> TextEvalRunResponse:
    """Run a text-chat eval scenario against a workflow (creates a TEXTCHAT run)."""
    org_id = _require_org(user)
    workflow_id = scenario.workflow_id

    workflow = await db_client.get_workflow(workflow_id, organization_id=org_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    async def create_session(wf_id: int, initial_context: dict[str, Any]):
        run_inputs = await prepare_workflow_run_inputs(
            db_client,
            workflow,
            initial_context=initial_context or {},
            use_draft=True,
            include_template_context=True,
        )
        name = f"EVAL-{uuid4().hex[:8].upper()}"
        workflow_run = await db_client.create_workflow_run(
            name=name,
            workflow_id=wf_id,
            mode=WorkflowRunMode.TEXTCHAT.value,
            user_id=user.id,
            initial_context=run_inputs.initial_context,
            organization_id=org_id,
            definition_id=run_inputs.definition_id,
        )
        set_current_run_id(workflow_run.id)

        quota = await authorize_workflow_run_start(
            workflow_id=wf_id,
            organization_id=org_id,
            workflow_run_id=workflow_run.id,
            actor_user=user,
        )
        if not quota.has_quota:
            raise HTTPException(status_code=402, detail=quota.error_message)

        annotations = {
            "tester": {"source": "text_eval_harness", "modality": "text"},
            "eval": {"scenario_name": scenario.name},
        }
        await db_client.update_workflow_run(workflow_run.id, annotations=annotations)

        text_session = await db_client.ensure_workflow_run_text_session(
            workflow_run.id,
            session_data=default_text_chat_session_data(),
            checkpoint=default_text_chat_checkpoint(),
        )
        try:
            text_session = await initialize_text_chat_session(
                run_id=workflow_run.id,
                text_session=text_session,
            )
            text_session = await execute_pending_text_chat_turn(
                workflow_id=wf_id,
                run_id=workflow_run.id,
                text_session=text_session,
            )
        except (TextChatSessionRevisionConflictError, TextChatSessionExecutionError) as e:
            logger.warning(f"eval session init issue: {e}")

        return {"workflow_run_id": workflow_run.id}

    async def execute_turn(run_id: int, text: str):
        text_session = await db_client.get_workflow_run_text_session(
            run_id, organization_id=org_id
        )
        if not text_session:
            raise RuntimeError("text session missing")

        quota = await authorize_workflow_run_start(
            workflow_id=workflow_id,
            organization_id=org_id,
            workflow_run_id=run_id,
            actor_user=user,
        )
        if not quota.has_quota:
            raise HTTPException(status_code=402, detail=quota.error_message)

        text_session = await append_text_chat_user_message(
            run_id=run_id,
            text_session=text_session,
            user_text=text,
            expected_revision=None,
        )
        text_session = await execute_pending_text_chat_turn(
            workflow_id=workflow_id,
            run_id=run_id,
            text_session=text_session,
        )
        run = await db_client.get_workflow_run(run_id, organization_id=org_id)
        gathered = (run.gathered_context if run else {}) or {}
        assistant = _assistant_from_session(text_session.session_data or {})
        return {"assistant_text": assistant, "gathered_context": gathered}

    return await run_text_eval_scenario(
        scenario=scenario,
        organization_id=org_id,
        user_id=user.id,
        execute_turn=execute_turn,
        create_session=create_session,
    )
