"""Voter contact management endpoints -- phone, email, address CRUD."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.schemas.voter_contact import (
    AddressCreateRequest,
    AddressResponse,
    EmailCreateRequest,
    EmailResponse,
    PhoneCreateRequest,
    PhoneResponse,
)
from app.services.voter_contact import VoterContactService

router = APIRouter()

_service = VoterContactService()


# ---------------------------------------------------------------------------
# Get all contacts
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/voters/{voter_id}/contacts",
)
async def get_voter_contacts(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get all contacts for a voter grouped by type.

    Returns phones, emails, and addresses. Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    contacts = await _service.get_voter_contacts(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
    )

    return {
        "phones": [PhoneResponse.model_validate(p) for p in contacts["phones"]],
        "emails": [EmailResponse.model_validate(e) for e in contacts["emails"]],
        "addresses": [AddressResponse.model_validate(a) for a in contacts["addresses"]],
    }


# ---------------------------------------------------------------------------
# Phone endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/phones",
    response_model=PhoneResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_phone(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: PhoneCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Add a phone contact for a voter. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    phone = await _service.add_phone(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        value=body.value,
        type=body.type,
        is_primary=body.is_primary,
        source=body.source,
        user_id=user.id,
    )
    await db.commit()

    return PhoneResponse.model_validate(phone)


@router.patch(
    "/campaigns/{campaign_id}/voters/{voter_id}/phones/{phone_id}",
    response_model=PhoneResponse,
)
async def update_phone(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    phone_id: uuid.UUID,
    body: PhoneCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update a phone contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    update_data = body.model_dump(exclude_unset=True)
    phone = await _service.update_phone(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        phone_id=phone_id,
        user_id=user.id,
        **update_data,
    )
    await db.commit()

    return PhoneResponse.model_validate(phone)


@router.delete(
    "/campaigns/{campaign_id}/voters/{voter_id}/phones/{phone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_phone(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    phone_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a phone contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    await _service.delete_phone(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        phone_id=phone_id,
        user_id=user.id,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Email endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/emails",
    response_model=EmailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_email(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: EmailCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Add an email contact for a voter. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    email = await _service.add_email(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        value=body.value,
        type=body.type,
        is_primary=body.is_primary,
        source=body.source,
        user_id=user.id,
    )
    await db.commit()

    return EmailResponse.model_validate(email)


@router.patch(
    "/campaigns/{campaign_id}/voters/{voter_id}/emails/{email_id}",
    response_model=EmailResponse,
)
async def update_email(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    email_id: uuid.UUID,
    body: EmailCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update an email contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    update_data = body.model_dump(exclude_unset=True)
    email = await _service.update_email(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        email_id=email_id,
        user_id=user.id,
        **update_data,
    )
    await db.commit()

    return EmailResponse.model_validate(email)


@router.delete(
    "/campaigns/{campaign_id}/voters/{voter_id}/emails/{email_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_email(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    email_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete an email contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    await _service.delete_email(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        email_id=email_id,
        user_id=user.id,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Address endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/addresses",
    response_model=AddressResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_address(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: AddressCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Add an address contact for a voter. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    address = await _service.add_address(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        type=body.type,
        is_primary=body.is_primary,
        source=body.source,
        user_id=user.id,
    )
    await db.commit()

    return AddressResponse.model_validate(address)


@router.patch(
    "/campaigns/{campaign_id}/voters/{voter_id}/addresses/{address_id}",
    response_model=AddressResponse,
)
async def update_address(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    address_id: uuid.UUID,
    body: AddressCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update an address contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    update_data = body.model_dump(exclude_unset=True)
    address = await _service.update_address(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        address_id=address_id,
        user_id=user.id,
        **update_data,
    )
    await db.commit()

    return AddressResponse.model_validate(address)


@router.delete(
    "/campaigns/{campaign_id}/voters/{voter_id}/addresses/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_address(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    address_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete an address contact. Requires manager+ role."""
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    await _service.delete_address(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        address_id=address_id,
        user_id=user.id,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Set primary
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/contacts/{contact_type}/{contact_id}/set-primary",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def set_primary(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    contact_type: str,
    contact_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Set a contact as primary, unsetting others of the same type.

    contact_type must be one of: phones, emails, addresses.
    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    if contact_type not in ("phones", "emails", "addresses"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid contact type: {contact_type}."
                " Must be phones, emails, or addresses."
            ),
        )

    await _service.set_primary(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        contact_type=contact_type,
        contact_id=contact_id,
        user_id=user.id,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
