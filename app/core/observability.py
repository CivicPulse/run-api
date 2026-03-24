"""Observability context variables for request tracing."""

from __future__ import annotations

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
campaign_id_var: ContextVar[str] = ContextVar("campaign_id", default="")
