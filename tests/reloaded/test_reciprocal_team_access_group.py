"""
reloaded downstream tests — team -> access-group reciprocal sync.

Covers the fix that closes the litellm-patched relaxation gap: setting
team.access_group_ids from the team side must write the reciprocal
access_group.assigned_team_ids so the upstream MCP anti-spoof guard is
satisfied without any relaxation. No DB / network — a tiny in-memory
fake of the prisma client. Sync wrappers via asyncio.run so the suite
needs no pytest-asyncio config.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from litellm.proxy.management_endpoints.access_group_endpoints import (  # noqa: E402
    _sync_add_team_to_access_groups,
    _sync_remove_team_from_access_groups,
    reconcile_team_access_group_assignments,
)


class _Row:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _Table:
    def __init__(self, rows, pk):
        self._rows = {r.__dict__[pk]: r for r in rows}
        self._pk = pk
        self.updates = []

    async def find_unique(self, where):
        return self._rows.get(where[self._pk])

    async def find_many(self, where=None):
        return list(self._rows.values())

    async def update(self, where, data):
        row = self._rows[where[self._pk]]
        for k, v in data.items():
            setattr(row, k, v)
        self.updates.append((where[self._pk], data))
        return row


class _DB:
    def __init__(self, access_groups, teams=None):
        self.litellm_accessgrouptable = _Table(access_groups, "access_group_id")
        self.litellm_teamtable = _Table(teams or [], "team_id")


class _Prisma:
    def __init__(self, db):
        self.db = db


def test_add_team_to_access_groups_is_idempotent():
    db = _DB([_Row(access_group_id="ag1", assigned_team_ids=[])])
    asyncio.run(_sync_add_team_to_access_groups(db, ["ag1"], "teamA"))
    assert db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids == ["teamA"]
    # second call must not duplicate
    asyncio.run(_sync_add_team_to_access_groups(db, ["ag1"], "teamA"))
    assert db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids == ["teamA"]


def test_add_team_skips_missing_access_group():
    db = _DB([_Row(access_group_id="ag1", assigned_team_ids=[])])
    # ag-missing must be silently skipped, ag1 still updated
    asyncio.run(_sync_add_team_to_access_groups(db, ["ag-missing", "ag1"], "teamB"))
    assert db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids == ["teamB"]


def test_remove_team_from_access_groups():
    db = _DB([_Row(access_group_id="ag1", assigned_team_ids=["teamA", "teamB"])])
    asyncio.run(_sync_remove_team_from_access_groups(db, ["ag1"], "teamA"))
    assert db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids == ["teamB"]
    # idempotent removal
    asyncio.run(_sync_remove_team_from_access_groups(db, ["ag1"], "teamA"))
    assert db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids == ["teamB"]


def test_reconcile_backfills_missing_reciprocals_non_destructively():
    db = _DB(
        access_groups=[
            # ag1 already lists an unrelated team assigned from the AG side —
            # must NOT be removed by the non-destructive backfill.
            _Row(access_group_id="ag1", assigned_team_ids=["preexisting"]),
            _Row(access_group_id="ag2", assigned_team_ids=[]),
        ],
        teams=[
            _Row(team_id="t1", access_group_ids=["ag1", "ag2"]),
            _Row(team_id="t2", access_group_ids=["ag2"]),
            _Row(team_id="t3", access_group_ids=[]),
        ],
    )
    updated = asyncio.run(reconcile_team_access_group_assignments(_Prisma(db)))
    assert updated == 2  # ag1 and ag2 both gained reciprocals
    assert set(db.litellm_accessgrouptable._rows["ag1"].assigned_team_ids) == {
        "preexisting",
        "t1",
    }
    assert set(db.litellm_accessgrouptable._rows["ag2"].assigned_team_ids) == {
        "t1",
        "t2",
    }
    # second run is a no-op (idempotent)
    assert asyncio.run(reconcile_team_access_group_assignments(_Prisma(db))) == 0


def test_reconcile_handles_none_client():
    assert asyncio.run(reconcile_team_access_group_assignments(None)) == 0
