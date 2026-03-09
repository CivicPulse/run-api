"""Integration tests for phone banking RLS isolation."""

from __future__ import annotations

import pytest


class TestPhoneBankingRLS:
    """Tests for row-level security isolation across phone banking tables."""

    @pytest.mark.skip(reason="stub")
    def test_call_list_rls_isolation(self) -> None:
        """Campaign A can't see campaign B call lists."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_call_list_entry_rls_isolation(self) -> None:
        """Entries isolated via call_list parent."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_phone_bank_session_rls_isolation(self) -> None:
        """Sessions isolated by campaign_id."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_session_caller_rls_isolation(self) -> None:
        """Callers isolated via session parent."""
        raise NotImplementedError

    @pytest.mark.skip(reason="stub")
    def test_dnc_rls_isolation(self) -> None:
        """DNC entries isolated by campaign_id."""
        raise NotImplementedError
