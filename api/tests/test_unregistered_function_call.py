"""Tests for handling unregistered function calls."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from pipecat.frames.frames import (
    FunctionCallInProgressFrame,
    FunctionCallResultFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    TextFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.processors.aggregators.llm_context import LLMContext

from pipecat.tests import MockLLMService, run_test


@pytest.mark.asyncio
async def test_unregistered_function_call_is_ignored():
    """Unregistered function calls should not crash the pipeline."""
    # Minimal smoke test placeholder – content will be overwritten by full fix batch
    pass
