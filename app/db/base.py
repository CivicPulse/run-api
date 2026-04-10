"""SQLAlchemy declarative base."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# Import all models here so Alembic can detect them.
# These imports must be after Base is defined to avoid circular imports.
# ImportChunk and ImportChunkStatus are registered via app.models.import_job.
import app.models.call_list  # noqa: E402, F401
import app.models.call_record  # noqa: E402, F401
import app.models.campaign  # noqa: E402, F401
import app.models.campaign_member  # noqa: E402, F401
import app.models.communication_ledger  # noqa: E402, F401
import app.models.dnc  # noqa: E402, F401
import app.models.email_delivery_attempt  # noqa: E402, F401
import app.models.import_job  # noqa: E402, F401
import app.models.invite  # noqa: E402, F401
import app.models.org_phone_number  # noqa: E402, F401
import app.models.organization  # noqa: E402, F401
import app.models.organization_member  # noqa: E402, F401
import app.models.phone_bank  # noqa: E402, F401
import app.models.phone_validation  # noqa: E402, F401
import app.models.shift  # noqa: E402, F401
import app.models.signup_link  # noqa: E402, F401
import app.models.sms_conversation  # noqa: E402, F401
import app.models.sms_message  # noqa: E402, F401
import app.models.sms_opt_out  # noqa: E402, F401
import app.models.survey  # noqa: E402, F401
import app.models.turf  # noqa: E402, F401
import app.models.user  # noqa: E402, F401
import app.models.volunteer  # noqa: E402, F401
import app.models.volunteer_application  # noqa: E402, F401
import app.models.voter  # noqa: E402, F401
import app.models.voter_contact  # noqa: E402, F401
import app.models.voter_interaction  # noqa: E402, F401
import app.models.voter_list  # noqa: E402, F401
import app.models.voter_search  # noqa: E402, F401
import app.models.walk_list  # noqa: E402, F401
import app.models.webhook_event  # noqa: E402, F401
