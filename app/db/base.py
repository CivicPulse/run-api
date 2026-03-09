"""SQLAlchemy declarative base."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# Import all models here so Alembic can detect them.
# These imports must be after Base is defined to avoid circular imports.
import app.models.campaign  # noqa: E402, F401
import app.models.campaign_member  # noqa: E402, F401
import app.models.import_job  # noqa: E402, F401
import app.models.invite  # noqa: E402, F401
import app.models.user  # noqa: E402, F401
import app.models.voter  # noqa: E402, F401
import app.models.voter_contact  # noqa: E402, F401
import app.models.voter_interaction  # noqa: E402, F401
import app.models.voter_list  # noqa: E402, F401
import app.models.turf  # noqa: E402, F401
import app.models.walk_list  # noqa: E402, F401
import app.models.survey  # noqa: E402, F401
