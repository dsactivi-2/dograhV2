import pytest

from api.services.pipecat.pre_call_fetch import _extract_initial_context
from api.services.workflow.dto import PreCallFetchMode, StartCallNodeData
from api.services.workflow.workflow_graph import Node


class TestPreCallFetchMode:
    """Tests for PreCallFetchMode and should_run_pre_call_fetch logic."""

    def _make_node(self, mode: str | None = None, enabled: bool = False):
        """Build a start-call Node with the specified mode/enabled fields."""
        data = StartCallNodeData(
            name="Start",
            prompt="Hi",
            pre_call_fetch_mode=(
                PreCallFetchMode(mode) if mode else None
            ),
            pre_call_fetch_enabled=enabled,
            pre_call_fetch_url="https://example.com/context",
        )
        return Node(id="start-1", node_type="startCall", data=data)

    def test_mode_disabled_never_runs(self):
        node = self._make_node(mode="disabled")
        assert not node.should_run_pre_call_fetch(None)
        assert not node.should_run_pre_call_fetch("inbound")
        assert not node.should_run_pre_call_fetch("outbound")

    def test_mode_always_runs_for_any_direction(self):
        node = self._make_node(mode="always")
        assert node.should_run_pre_call_fetch(None)
        assert node.should_run_pre_call_fetch("inbound")
        assert node.should_run_pre_call_fetch("outbound")

    def test_mode_inbound_only_runs_for_inbound(self):
        node = self._make_node(mode="inbound")
        assert node.should_run_pre_call_fetch("inbound")
        assert not node.should_run_pre_call_fetch("outbound")
        assert not node.should_run_pre_call_fetch(None)

    def test_mode_outbound_only_runs_for_outbound(self):
        node = self._make_node(mode="outbound")
        assert node.should_run_pre_call_fetch("outbound")
        assert not node.should_run_pre_call_fetch("inbound")
        assert not node.should_run_pre_call_fetch(None)

    def test_legacy_enabled_true_migrates_to_always(self):
        node = self._make_node(mode=None, enabled=True)
        assert node.pre_call_fetch_mode == "always"
        assert node.should_run_pre_call_fetch("inbound")
        assert node.should_run_pre_call_fetch("outbound")

    def test_legacy_enabled_false_migrates_to_disabled(self):
        node = self._make_node(mode=None, enabled=False)
        assert node.pre_call_fetch_mode == "disabled"
        assert not node.should_run_pre_call_fetch("inbound")
        assert not node.should_run_pre_call_fetch("outbound")

    def test_mode_takes_precedence_over_legacy_enabled(self):
        """If mode is explicitly set, it wins over pre_call_fetch_enabled."""
        node = self._make_node(mode="disabled", enabled=True)
        assert node.pre_call_fetch_mode == "disabled"
        assert not node.should_run_pre_call_fetch("inbound")


class TestStartCallNodeDataMigration:
    """Tests for the legacy pre_call_fetch_enabled migration in StartCallNodeData."""

    def test_migration_when_no_mode_and_enabled_true(self):
        data = StartCallNodeData(
            name="Start",
            prompt="Hi",
            pre_call_fetch_enabled=True,
        )
        assert data.pre_call_fetch_mode == PreCallFetchMode.always

    def test_migration_when_no_mode_and_enabled_false(self):
        data = StartCallNodeData(
            name="Start",
            prompt="Hi",
            pre_call_fetch_enabled=False,
        )
        assert data.pre_call_fetch_mode == PreCallFetchMode.disabled

    def test_explicit_mode_not_overwritten(self):
        data = StartCallNodeData(
            name="Start",
            prompt="Hi",
            pre_call_fetch_mode=PreCallFetchMode.inbound,
            pre_call_fetch_enabled=True,
        )
        assert data.pre_call_fetch_mode == PreCallFetchMode.inbound


class TestExtractInitialContext:
    """Tests for _extract_initial_context, the pre-call fetch response parser."""

    def test_initial_context_nested_under_call_inbound(self):
        """The canonical `initial_context` key nested under `call_inbound`."""
        response = {"call_inbound": {"initial_context": {"customer_name": "Jane"}}}
        assert _extract_initial_context(response) == {"customer_name": "Jane"}

    def test_initial_context_at_top_level(self):
        """The canonical `initial_context` key at the top level."""
        response = {"initial_context": {"customer_name": "Jane"}}
        assert _extract_initial_context(response) == {"customer_name": "Jane"}

    def test_legacy_dynamic_variables_nested(self):
        """The legacy `dynamic_variables` key still works nested under `call_inbound`."""
        response = {"call_inbound": {"dynamic_variables": {"customer_name": "Jane"}}}
        assert _extract_initial_context(response) == {"customer_name": "Jane"}

    def test_legacy_dynamic_variables_at_top_level(self):
        """The legacy `dynamic_variables` key still works at the top level."""
        response = {"dynamic_variables": {"customer_name": "Jane"}}
        assert _extract_initial_context(response) == {"customer_name": "Jane"}

    def test_initial_context_takes_precedence_over_legacy(self):
        """When both keys are present, `initial_context` wins."""
        response = {
            "call_inbound": {
                "initial_context": {"source": "new"},
                "dynamic_variables": {"source": "legacy"},
            }
        }
        assert _extract_initial_context(response) == {"source": "new"}

    def test_falls_back_to_legacy_when_initial_context_not_a_dict(self):
        """A non-dict `initial_context` falls back to `dynamic_variables`."""
        response = {
            "initial_context": None,
            "dynamic_variables": {"customer_name": "Jane"},
        }
        assert _extract_initial_context(response) == {"customer_name": "Jane"}

    def test_nested_values_preserved(self):
        """Nested objects pass through untouched for dot-notation access."""
        response = {
            "call_inbound": {
                "initial_context": {"customer": {"address": {"city": "LA"}}}
            }
        }
        assert _extract_initial_context(response) == {
            "customer": {"address": {"city": "LA"}}
        }

    def test_empty_when_no_known_keys(self):
        """A response with neither key yields an empty dict."""
        assert _extract_initial_context({"call_inbound": {"agent_id": 1}}) == {}

    def test_empty_when_call_inbound_missing(self):
        """No `call_inbound` and no top-level keys yields an empty dict."""
        assert _extract_initial_context({}) == {}

    def test_non_dict_vars_yield_empty(self):
        """A non-dict value under a known key yields an empty dict."""
        assert _extract_initial_context({"initial_context": "nope"}) == {}
