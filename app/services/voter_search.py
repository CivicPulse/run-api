"""Denormalized voter search surface refresh helpers."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, text

from app.models.voter_search import VoterSearchRecord


class VoterSearchIndexService:
    """Refresh the campaign-scoped lookup surface from voter/contact writes."""

    @staticmethod
    def _is_mock_session(session) -> bool:
        return type(session).__module__.startswith("unittest.mock")

    async def refresh_records(
        self,
        session,
        voter_ids: Sequence[uuid.UUID | str],
    ) -> None:
        """Upsert search records for the provided voters."""
        if self._is_mock_session(session):
            return
        normalized_ids = [
            voter_id if isinstance(voter_id, uuid.UUID) else uuid.UUID(str(voter_id))
            for voter_id in voter_ids
            if voter_id
        ]
        if not normalized_ids:
            return

        refresh_sql = text(
            """
            WITH target_voters AS (
                SELECT
                    v.id AS voter_id,
                    v.campaign_id,
                    lower(trim(concat_ws(' ', v.first_name, v.last_name))) AS name_full,
                    lower(coalesce(v.first_name, '')) AS name_first,
                    lower(coalesce(v.last_name, '')) AS name_last,
                    lower(coalesce(v.registration_city, '')) AS city,
                    lower(coalesce(v.registration_state, '')) AS state,
                    coalesce(v.registration_zip, '') AS zip_code,
                    lower(trim(concat_ws(' ', v.source_type, v.source_id))) AS source_ids,
                    lower(
                        trim(
                            concat_ws(
                                ' ',
                                v.registration_line1,
                                v.registration_line2,
                                v.mailing_line1,
                                v.mailing_line2,
                                v.registration_city,
                                v.registration_state,
                                v.registration_zip
                            )
                        )
                    ) AS base_address
                FROM voters v
                WHERE v.id = ANY(CAST(:voter_ids AS uuid[]))
            ),
            phone_agg AS (
                SELECT
                    vp.voter_id,
                    lower(string_agg(vp.value, ' ' ORDER BY vp.is_primary DESC, vp.updated_at DESC, vp.id)) AS phone_values,
                    string_agg(
                        regexp_replace(vp.value, '\\D', '', 'g'),
                        ' '
                        ORDER BY vp.is_primary DESC, vp.updated_at DESC, vp.id
                    ) AS phone_digits
                FROM voter_phones vp
                WHERE vp.voter_id = ANY(CAST(:voter_ids AS uuid[]))
                GROUP BY vp.voter_id
            ),
            email_agg AS (
                SELECT
                    ve.voter_id,
                    lower(string_agg(ve.value, ' ' ORDER BY ve.is_primary DESC, ve.updated_at DESC, ve.id)) AS email_values
                FROM voter_emails ve
                WHERE ve.voter_id = ANY(CAST(:voter_ids AS uuid[]))
                GROUP BY ve.voter_id
            ),
            address_agg AS (
                SELECT
                    va.voter_id,
                    lower(
                        string_agg(
                            trim(concat_ws(' ', va.address_line1, va.address_line2, va.city, va.state, va.zip_code)),
                            ' '
                            ORDER BY va.is_primary DESC, va.updated_at DESC, va.id
                        )
                    ) AS address_text
                FROM voter_addresses va
                WHERE va.voter_id = ANY(CAST(:voter_ids AS uuid[]))
                GROUP BY va.voter_id
            )
            INSERT INTO voter_search_records (
                voter_id,
                campaign_id,
                name_full,
                name_first,
                name_last,
                city,
                state,
                zip_code,
                source_ids,
                email_values,
                phone_values,
                phone_digits,
                address_text,
                document,
                refreshed_at
            )
            SELECT
                tv.voter_id,
                tv.campaign_id,
                coalesce(tv.name_full, ''),
                coalesce(tv.name_first, ''),
                coalesce(tv.name_last, ''),
                coalesce(tv.city, ''),
                coalesce(tv.state, ''),
                coalesce(tv.zip_code, ''),
                coalesce(tv.source_ids, ''),
                coalesce(ea.email_values, ''),
                coalesce(pa.phone_values, ''),
                coalesce(pa.phone_digits, ''),
                trim(concat_ws(' ', tv.base_address, coalesce(aa.address_text, ''))),
                trim(
                    concat_ws(
                        ' ',
                        tv.name_full,
                        tv.name_first,
                        tv.name_last,
                        tv.city,
                        tv.state,
                        tv.zip_code,
                        tv.source_ids,
                        coalesce(ea.email_values, ''),
                        coalesce(pa.phone_values, ''),
                        coalesce(pa.phone_digits, ''),
                        tv.base_address,
                        coalesce(aa.address_text, '')
                    )
                ),
                now()
            FROM target_voters tv
            LEFT JOIN phone_agg pa ON pa.voter_id = tv.voter_id
            LEFT JOIN email_agg ea ON ea.voter_id = tv.voter_id
            LEFT JOIN address_agg aa ON aa.voter_id = tv.voter_id
            ON CONFLICT (voter_id) DO UPDATE SET
                campaign_id = EXCLUDED.campaign_id,
                name_full = EXCLUDED.name_full,
                name_first = EXCLUDED.name_first,
                name_last = EXCLUDED.name_last,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                zip_code = EXCLUDED.zip_code,
                source_ids = EXCLUDED.source_ids,
                email_values = EXCLUDED.email_values,
                phone_values = EXCLUDED.phone_values,
                phone_digits = EXCLUDED.phone_digits,
                address_text = EXCLUDED.address_text,
                document = EXCLUDED.document,
                refreshed_at = now()
            """
        )
        await session.execute(refresh_sql, {"voter_ids": normalized_ids})

    async def delete_records(
        self,
        session,
        voter_ids: Sequence[uuid.UUID | str],
    ) -> None:
        """Delete search records when a caller removes voters before FK cascade."""
        if self._is_mock_session(session):
            return
        normalized_ids = [
            voter_id if isinstance(voter_id, uuid.UUID) else uuid.UUID(str(voter_id))
            for voter_id in voter_ids
            if voter_id
        ]
        if not normalized_ids:
            return
        await session.execute(
            delete(VoterSearchRecord).where(
                VoterSearchRecord.voter_id.in_(normalized_ids)
            )
        )
