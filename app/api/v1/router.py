"""V1 API router -- aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    campaigns,
    imports,
    invites,
    members,
    surveys,
    users,
    voter_contacts,
    voter_interactions,
    voter_lists,
    voter_tags,
    voters,
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
