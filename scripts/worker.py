"""Procrastinate worker entrypoint.

Initializes Sentry + logging, starts a minimal HTTP health endpoint
on port 8001, then runs the async Procrastinate worker loop.

Run via: python scripts/worker.py
"""

from __future__ import annotations

import asyncio
import contextlib
import sys
from pathlib import Path

# Ensure the project root is on sys.path so `app.*` imports work
# when running as `python scripts/worker.py` from the repo root.
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from loguru import logger  # noqa: E402

from app.core.sentry import init_sentry  # noqa: E402
from app.services.import_recovery import scan_for_orphaned_imports  # noqa: E402

# ---------------------------------------------------------------
# Minimal HTTP health endpoint (D-04)
# ---------------------------------------------------------------

HEALTH_PORT = 8001


async def _handle_health(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
) -> None:
    """Respond to any HTTP request with 200 OK.

    Only intended for K8s liveness/readiness probes at GET /healthz.
    Reads the full request (up to 4KB) then sends a minimal response.
    """
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(reader.read(4096), timeout=5.0)

    response = (
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: 2\r\n"
        "Connection: close\r\n"
        "\r\n"
        "ok"
    )
    writer.write(response.encode())
    await writer.drain()
    writer.close()
    await writer.wait_closed()


async def _start_health_server() -> asyncio.Server:
    """Start the TCP health server on HEALTH_PORT."""
    server = await asyncio.start_server(
        _handle_health,
        "0.0.0.0",
        HEALTH_PORT,  # noqa: S104
    )
    logger.info("Health endpoint listening on :{}", HEALTH_PORT)
    return server


# ---------------------------------------------------------------
# Worker main
# ---------------------------------------------------------------


async def main() -> None:
    """Initialize observability, start health server, run worker."""
    init_sentry()
    logger.info("Starting Procrastinate import worker")

    # Import here (after sys.path is set) to avoid import errors
    from app.tasks.import_task import recover_import
    from app.tasks.procrastinate_app import procrastinate_app

    health_server = await _start_health_server()

    try:
        async with procrastinate_app.open_async():
            stale_imports = await scan_for_orphaned_imports()
            for candidate in stale_imports:
                logger.warning(
                    "Detected orphaned import {} for campaign {} ({})",
                    candidate.import_job_id,
                    candidate.campaign_id,
                    candidate.orphaned_reason,
                )
                await recover_import.defer_async(
                    import_job_id=candidate.import_job_id,
                    campaign_id=candidate.campaign_id,
                )
            logger.info("Procrastinate connected, waiting for jobs")
            await procrastinate_app.run_worker_async(
                queues=["imports"],
                name="import-worker",
            )
    finally:
        health_server.close()
        await health_server.wait_closed()
        logger.info("Worker shut down")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker interrupted")
