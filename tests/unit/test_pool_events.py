"""Unit tests for SQLAlchemy pool checkout events.

Verifies that the pool checkout event correctly resets RLS context
(app.current_campaign_id) to a null UUID on every connection acquisition.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from sqlalchemy import event

from app.db.session import engine, reset_rls_context


class TestPoolCheckoutEvent:
    """Verify pool checkout event registration and behavior."""

    def test_checkout_event_registered(self):
        """The reset_rls_context handler is registered on
        engine.sync_engine for the 'checkout' event."""
        assert event.contains(engine.sync_engine, "checkout", reset_rls_context), (
            "reset_rls_context not registered on engine.sync_engine checkout"
        )

    def test_checkout_handler_resets_context(self):
        """The checkout handler executes set_config with null UUID
        and closes the cursor."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_record = MagicMock()
        mock_proxy = MagicMock()

        reset_rls_context(mock_conn, mock_record, mock_proxy)

        mock_conn.cursor.assert_called_once()
        mock_cursor.execute.assert_called_once()
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "set_config" in call_sql
        assert "app.current_campaign_id" in call_sql
        assert "00000000-0000-0000-0000-000000000000" in call_sql
        mock_cursor.close.assert_called_once()

    def test_checkout_handler_uses_cursor_pattern(self):
        """The handler uses cursor.execute() then cursor.close()
        (not direct dbapi_connection.execute())."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        reset_rls_context(mock_conn, MagicMock(), MagicMock())

        # Should use cursor pattern, not direct execute
        mock_conn.execute.assert_not_called()
        mock_cursor.execute.assert_called_once()
        mock_cursor.close.assert_called_once()
