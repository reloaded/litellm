"""
reloaded downstream tests — /team/list (v1) must enrich access-group
inherited resources too.

Covers the fix that gives both /team/list and /v2/team/list the same
access_group_models / access_group_mcp_server_ids / access_group_agent_ids
fields, by exercising the shared _enrich_teams_with_access_group_resources
helper directly. No DB / network — the batched lookup is mocked.

Without this enrichment in v1, the dashboard's Key/Team Overview
Inherited Permissions card silently shows nothing even when the team
*is* bound to an access group with MCP servers / models / agents,
because the UI's useTeams() hook is what calls /team/list.
"""

import asyncio
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from litellm.proxy.management_endpoints.team_endpoints import (  # noqa: E402
    _enrich_teams_with_access_group_resources,
)


class _FakeTeam:
    """Duck-typed stand-in for TeamListResponseObject / TeamListItem.

    Only carries the fields the helper reads/writes.
    """

    def __init__(self, team_id, access_group_ids):
        self.team_id = team_id
        self.access_group_ids = access_group_ids
        self.access_group_models = None
        self.access_group_mcp_server_ids = None
        self.access_group_agent_ids = None


def _patch_resolver(fake_lookup):
    """Patch the batched access-group resolver to return `fake_lookup`."""
    async def fake_resolver(_ag_ids):
        return fake_lookup
    return patch(
        "litellm.proxy.management_endpoints.team_endpoints"
        "._batch_resolve_access_group_resources",
        new=fake_resolver,
    )


def test_enriches_team_with_single_access_group():
    teams = [_FakeTeam("t1", ["agA"])]
    fake = {
        "agA": {
            "models": ["gpt-4o"],
            "mcp_server_ids": ["mcp-time"],
            "agent_ids": ["agent-core"],
        }
    }
    with _patch_resolver(fake):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert teams[0].access_group_models == ["gpt-4o"]
    assert teams[0].access_group_mcp_server_ids == ["mcp-time"]
    assert teams[0].access_group_agent_ids == ["agent-core"]


def test_enriches_team_unions_resources_across_multiple_access_groups():
    teams = [_FakeTeam("t1", ["agA", "agB"])]
    fake = {
        "agA": {"models": ["m1"], "mcp_server_ids": ["s1"], "agent_ids": []},
        "agB": {"models": ["m2"], "mcp_server_ids": ["s2"], "agent_ids": ["a1"]},
    }
    with _patch_resolver(fake):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert set(teams[0].access_group_models) == {"m1", "m2"}
    assert set(teams[0].access_group_mcp_server_ids) == {"s1", "s2"}
    assert set(teams[0].access_group_agent_ids) == {"a1"}


def test_enriches_skips_teams_without_access_group_ids():
    # Mix of teams: t1 has groups, t2 has empty list, t3 has None.
    teams = [
        _FakeTeam("t1", ["agA"]),
        _FakeTeam("t2", []),
        _FakeTeam("t3", None),
    ]
    fake = {"agA": {"models": ["m1"], "mcp_server_ids": [], "agent_ids": []}}
    with _patch_resolver(fake):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert teams[0].access_group_models == ["m1"]
    # t2 / t3 are untouched.
    assert teams[1].access_group_models is None
    assert teams[2].access_group_models is None


def test_enriches_silently_drops_unresolvable_access_group_ids():
    # Team references one resolvable group and one that no longer exists;
    # the missing one is silently ignored.
    teams = [_FakeTeam("t1", ["agA", "stale-id"])]
    fake = {"agA": {"models": ["m1"], "mcp_server_ids": ["s1"], "agent_ids": []}}
    with _patch_resolver(fake):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert teams[0].access_group_models == ["m1"]
    assert teams[0].access_group_mcp_server_ids == ["s1"]
    assert teams[0].access_group_agent_ids == []


def test_no_resolver_calls_when_no_team_has_access_groups():
    teams = [_FakeTeam("t1", []), _FakeTeam("t2", None)]

    calls = []

    async def fake_resolver(_ids):
        calls.append(_ids)
        return {}

    with patch(
        "litellm.proxy.management_endpoints.team_endpoints"
        "._batch_resolve_access_group_resources",
        new=fake_resolver,
    ):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert calls == []  # short-circuits before touching the DB
    assert teams[0].access_group_models is None
    assert teams[1].access_group_models is None


def test_enrich_normalizes_to_empty_lists_when_no_groups_resolve():
    # Team references access groups that all fail to resolve. Helper
    # still normalizes the fields to [] (not None), matching the v2
    # endpoint's prior behaviour so downstream UI logic can rely on
    # the fields always being lists when access_group_ids is set.
    teams = [_FakeTeam("t1", ["missing-ag"])]
    with _patch_resolver({}):
        asyncio.run(_enrich_teams_with_access_group_resources(teams))
    assert teams[0].access_group_models == []
    assert teams[0].access_group_mcp_server_ids == []
    assert teams[0].access_group_agent_ids == []
