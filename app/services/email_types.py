"""Typed transactional email contracts."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class TransactionalTemplateKey(StrEnum):
    """Supported app-owned transactional template identifiers."""

    CAMPAIGN_MEMBER_INVITE = "campaign_member_invite"


@dataclass(slots=True)
class EmailTenantContext:
    """Explicit tenant scope carried with each send request."""

    organization_id: UUID | None = None
    campaign_id: UUID | None = None


@dataclass(slots=True)
class InviteTemplateData:
    """Structured data required for invite email rendering."""

    inviter_name: str
    organization_name: str
    campaign_name: str
    role_label: str
    accept_url: str
    expires_at: datetime


@dataclass(slots=True)
class RenderedEmail:
    """Rendered HTML/text output for a transactional email."""

    subject: str
    html_body: str
    text_body: str


@dataclass(slots=True)
class TransactionalEmail:
    """Fully-rendered outbound transactional email request."""

    template: TransactionalTemplateKey
    tenant: EmailTenantContext
    to_email: str
    rendered: RenderedEmail
    tags: tuple[str, ...] = ()
    metadata: Mapping[str, str] = field(default_factory=dict)
