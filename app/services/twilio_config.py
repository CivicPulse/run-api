"""Org-scoped Twilio configuration encryption and redaction helpers."""

from __future__ import annotations

from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class TwilioConfigError(RuntimeError):
    """Raised when Twilio configuration encryption cannot proceed safely."""


@dataclass(slots=True)
class EncryptedSecret:
    """Encrypted secret payload plus non-secret metadata."""

    ciphertext: str
    key_id: str
    last4: str


@dataclass(slots=True)
class TwilioCredentials:
    """Resolved Twilio provider credentials for downstream callers."""

    account_sid: str
    auth_token: str


class TwilioConfigService:
    """Owns Twilio config encryption, decryption, and redaction."""

    def __init__(self) -> None:
        self._current_key_id = settings.twilio_encryption_current_key_id

    def encrypt_auth_token(self, auth_token: str) -> EncryptedSecret:
        """Encrypt a Twilio auth token using the configured current key."""
        token = auth_token.strip()
        if not token:
            raise TwilioConfigError("Twilio auth token cannot be empty")
        fernet = self._fernet_for_key_id(self._current_key_id)
        ciphertext = fernet.encrypt(token.encode("utf-8")).decode("utf-8")
        return EncryptedSecret(
            ciphertext=ciphertext,
            key_id=self._current_key_id,
            last4=token[-4:],
        )

    def decrypt_auth_token(self, ciphertext: str, key_id: str) -> str:
        """Decrypt an encrypted auth token."""
        fernet = self._fernet_for_key_id(key_id)
        try:
            return fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise TwilioConfigError(
                "Stored Twilio auth token could not be decrypted"
            ) from exc

    def auth_token_hint(self, last4: str | None) -> str | None:
        """Return a masked hint safe for API and UI surfaces."""
        if not last4:
            return None
        return f"••••{last4}"

    def readiness(
        self,
        *,
        account_sid: str | None,
        auth_token_encrypted: str | None,
    ) -> bool:
        """Whether the org has the minimum config required for later Twilio work."""
        return bool(account_sid and auth_token_encrypted)

    def credentials_for_org(self, org: object) -> TwilioCredentials | None:
        """Resolve downstream Twilio credentials for an org model."""
        account_sid = getattr(org, "twilio_account_sid", None)
        ciphertext = getattr(org, "twilio_auth_token_encrypted", None)
        key_id = getattr(org, "twilio_auth_token_key_id", None)
        if not account_sid or not ciphertext or not key_id:
            return None
        return TwilioCredentials(
            account_sid=account_sid,
            auth_token=self.decrypt_auth_token(ciphertext, key_id),
        )

    def get_twilio_client(self, org: object):
        """Return an authenticated Twilio REST client for the given org."""
        from twilio.rest import Client as TwilioClient

        creds = self.credentials_for_org(org)
        if creds is None:
            raise TwilioConfigError(
                "Twilio credentials not configured for this org"
            )
        return TwilioClient(creds.account_sid, creds.auth_token)

    def _fernet_for_key_id(self, key_id: str) -> Fernet:
        keyring = settings.twilio_encryption_keys
        if not keyring:
            raise TwilioConfigError("Twilio encryption is not configured")
        key = keyring.get(key_id)
        if not key:
            raise TwilioConfigError(f"Unknown Twilio encryption key id: {key_id}")
        try:
            return Fernet(key.encode("utf-8"))
        except (TypeError, ValueError) as exc:
            raise TwilioConfigError(
                "Configured Twilio encryption key is invalid"
            ) from exc
