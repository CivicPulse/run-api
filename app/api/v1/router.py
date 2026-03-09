"""V1 API router -- aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    call_lists,
    campaigns,
    dnc,
    imports,
    invites,
    members,
    phone_banks,
    shifts,
    surveys,
    turfs,
    users,
    voter_contacts,
    voter_interactions,
    voter_lists,
    voter_tags,
    voters,
    volunteers,
    walk_lists,
)

router = APIRouter(prefix="/api/v1")

router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
router.include_router(users.router, prefix="/me", tags=["users"])
router.include_router(invites.router, tags=["invites"])
router.include_router(members.router, tags=["members"])
router.include_router(imports.router, tags=["imports"])
router.include_router(voter_interactions.router, tags=["voter-interactions"])
router.include_router(voter_contacts.router, tags=["voter-contacts"])
router.include_router(voters.router, tags=["voters"])
router.include_router(voter_lists.router, tags=["voter-lists"])
router.include_router(voter_tags.router, tags=["voter-tags"])
router.include_router(surveys.router, tags=["surveys"])
router.include_router(turfs.router, tags=["turfs"])
router.include_router(walk_lists.router, tags=["walk-lists"])
router.include_router(call_lists.router, tags=["call-lists"])
router.include_router(dnc.router, tags=["dnc"])
router.include_router(phone_banks.router, tags=["phone-banks"])
router.include_router(volunteers.router, tags=["volunteers"])
router.include_router(shifts.router, tags=["shifts"])
