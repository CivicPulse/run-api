"""S3-compatible object storage service.

Supports MinIO (local dev) and Cloudflare R2 (production) via aioboto3.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import aioboto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from loguru import logger

from app.core.config import settings

_S3_CONFIG = BotoConfig(signature_version="s3v4")


class StorageService:
    """Manages S3-compatible object storage operations.

    Provides pre-signed URL generation for direct client uploads and
    streaming file downloads for background processing.
    """

    def __init__(self) -> None:
        self.session = aioboto3.Session()

    def _client_kwargs(self) -> dict:
        """Return common kwargs for creating an S3 client."""
        return {
            "service_name": "s3",
            "endpoint_url": settings.s3_endpoint_url,
            "aws_access_key_id": settings.s3_access_key_id,
            "aws_secret_access_key": settings.s3_secret_access_key,
            "region_name": settings.s3_region,
            "config": _S3_CONFIG,
        }

    def _presign_client_kwargs(self) -> dict:
        """Return kwargs for an S3 client used to generate presigned URLs.

        Uses ``s3_presign_endpoint_url`` when set so that presigned URLs
        target a browser-accessible endpoint (e.g. a reverse proxy) while
        server-side operations continue to use the internal endpoint.
        """
        kwargs = self._client_kwargs()
        if settings.s3_presign_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_presign_endpoint_url
        return kwargs

    async def generate_upload_url(
        self,
        key: str,
        content_type: str = "text/csv",
    ) -> str:
        """Generate a pre-signed PUT URL for direct client upload.

        Args:
            key: S3 object key (e.g. ``imports/{campaign_id}/{job_id}.csv``).
            content_type: MIME type locked into the pre-signed URL.

        Returns:
            Pre-signed PUT URL valid for 1 hour.
        """
        async with self.session.client(**self._presign_client_kwargs()) as s3:
            url: str = await s3.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": settings.s3_bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=3600,
            )
            return url

    async def generate_download_url(self, key: str) -> str:
        """Generate a pre-signed GET URL for file download.

        Args:
            key: S3 object key.

        Returns:
            Pre-signed GET URL valid for 1 hour.
        """
        async with self.session.client(**self._presign_client_kwargs()) as s3:
            url: str = await s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": settings.s3_bucket,
                    "Key": key,
                },
                ExpiresIn=3600,
            )
            return url

    async def download_file(
        self, key: str, chunk_size: int = 65_536
    ) -> AsyncIterator[bytes]:
        """Stream file content from S3 for background processing.

        Args:
            key: S3 object key.
            chunk_size: Byte size of each streamed chunk (default 64KB).

        Yields:
            Chunks of file bytes.
        """
        async with self.session.client(**self._client_kwargs()) as s3:
            response = await s3.get_object(
                Bucket=settings.s3_bucket,
                Key=key,
            )
            async for chunk in response["Body"].iter_chunks(chunk_size):
                yield chunk

    async def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Upload raw bytes directly to S3.

        Used for server-generated files like error reports.

        Args:
            key: S3 object key.
            data: Raw bytes to upload.
            content_type: MIME type for the object.
        """
        async with self.session.client(**self._client_kwargs()) as s3:
            await s3.put_object(
                Bucket=settings.s3_bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

    async def delete_object(self, key: str) -> None:
        """Delete an object from S3."""
        async with self.session.client(**self._client_kwargs()) as s3:
            await s3.delete_object(
                Bucket=settings.s3_bucket,
                Key=key,
            )

    async def delete_objects(self, keys: list[str]) -> None:
        """Delete multiple objects by key.

        Uses S3 delete_objects batch API (up to 1000 keys per call).
        No-op if keys is empty.

        Args:
            keys: List of S3 object keys to delete.
        """
        if not keys:
            return
        async with self.session.client(**self._client_kwargs()) as s3:
            # S3 delete_objects supports up to 1000 keys per call
            for i in range(0, len(keys), 1000):
                batch = keys[i : i + 1000]
                await s3.delete_objects(
                    Bucket=settings.s3_bucket,
                    Delete={"Objects": [{"Key": k} for k in batch]},
                )

    async def ensure_bucket(self) -> None:
        """Create the configured bucket if it does not exist.

        Safe to call on every startup -- uses ``head_bucket`` to check
        existence before attempting creation.
        """
        async with self.session.client(**self._client_kwargs()) as s3:
            try:
                await s3.head_bucket(Bucket=settings.s3_bucket)
                logger.debug("Bucket {} exists", settings.s3_bucket)
            except ClientError:
                await s3.create_bucket(Bucket=settings.s3_bucket)
                logger.info("Created bucket {}", settings.s3_bucket)
