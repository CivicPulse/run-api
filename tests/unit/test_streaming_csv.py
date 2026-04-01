"""Tests for streaming CSV line iterator (MEMD-01).

Validates that stream_csv_lines yields correct decoded text lines from
multi-chunk byte input, with encoding detection, BOM stripping, CRLF
handling, and empty line skipping.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest


def _chunked(data: bytes, size: int):
    """Split bytes into fixed-size chunks."""
    for i in range(0, len(data), size):
        yield data[i : i + size]


def _make_mock_storage(csv_bytes: bytes, chunk_size: int = 10):
    """Create a mock StorageService whose download_file yields small chunks."""
    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        for chunk in _chunked(csv_bytes, chunk_size):
            yield chunk

    # Use the specified chunk_size for splitting, not the parameter default
    async def mock_download_fixed(key, chunk_size=65_536):
        for chunk in _chunked(csv_bytes, size):
            yield chunk

    # Bind the outer chunk_size to the closure
    size = chunk_size

    storage.download_file = mock_download_fixed
    return storage


@pytest.mark.asyncio
async def test_multi_chunk_line_reconstruction():
    """MEMD-01a: Lines split across chunk boundaries are reconstructed."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"First_Name,Last_Name,VoterID\nJohn,Doe,V001\nJane,Smith,V002\n"
    storage = _make_mock_storage(csv_data, chunk_size=10)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    assert lines == [
        "First_Name,Last_Name,VoterID",
        "John,Doe,V001",
        "Jane,Smith,V002",
    ]


@pytest.mark.asyncio
async def test_encoding_detection_utf8sig():
    """MEMD-01b: _detect_encoding identifies utf-8-sig from valid UTF-8 bytes."""
    from app.services.import_service import _detect_encoding

    assert _detect_encoding(b"\xef\xbb\xbfFirst") == "utf-8-sig"
    assert _detect_encoding(b"Hello, World") == "utf-8-sig"


@pytest.mark.asyncio
async def test_encoding_detection_latin1():
    """MEMD-01b: _detect_encoding falls back to latin-1 for non-UTF-8 bytes."""
    from app.services.import_service import _detect_encoding

    # Bytes that are invalid UTF-8 (isolated high bytes)
    assert _detect_encoding(b"\xe9\xe8\xe0") == "latin-1"


@pytest.mark.asyncio
async def test_bom_stripping():
    """MEMD-01c: First line from BOM-prefixed CSV has no BOM character."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"\xef\xbb\xbfFirst_Name,Last_Name\nJohn,Doe\n"
    storage = _make_mock_storage(csv_data, chunk_size=10)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    # First line should NOT start with BOM character \ufeff
    assert not lines[0].startswith("\ufeff")
    assert lines[0] == "First_Name,Last_Name"
    assert lines[1] == "John,Doe"


@pytest.mark.asyncio
async def test_crlf_handling():
    """MEMD-01d: Windows line endings produce clean lines without \\r."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"a,b\r\nc,d\r\n"
    storage = _make_mock_storage(csv_data, chunk_size=5)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    assert len(lines) == 2
    for line in lines:
        assert "\r" not in line
    assert lines == ["a,b", "c,d"]


@pytest.mark.asyncio
async def test_empty_lines():
    """MEMD-01e: Empty lines in the stream are skipped."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"a,b\n\nc,d\n"
    storage = _make_mock_storage(csv_data, chunk_size=5)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    # Only 2 non-empty lines, the empty line between them is skipped
    assert len(lines) == 2
    assert lines == ["a,b", "c,d"]


@pytest.mark.asyncio
async def test_single_chunk():
    """MEMD-01f: Works when entire file arrives as one chunk."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"First_Name,Last_Name\nJohn,Doe\nJane,Smith\n"
    # chunk_size larger than data -- single chunk
    storage = _make_mock_storage(csv_data, chunk_size=1024)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    assert lines == [
        "First_Name,Last_Name",
        "John,Doe",
        "Jane,Smith",
    ]


@pytest.mark.asyncio
async def test_no_full_materialization():
    """MEMD-01g: Lines are yielded incrementally, not after all chunks consumed."""
    from app.services.import_service import stream_csv_lines

    chunks_consumed = []
    lines_yielded = []

    csv_data = b"header\nrow1\nrow2\nrow3\n"
    raw_chunks = list(_chunked(csv_data, 8))

    storage = AsyncMock()

    async def mock_download(key, chunk_size=65_536):
        for i, chunk in enumerate(raw_chunks):
            chunks_consumed.append(i)
            yield chunk

    storage.download_file = mock_download

    async for line in stream_csv_lines(storage, "test.csv"):
        lines_yielded.append(line)
        # After first line is yielded, not all chunks should be consumed yet
        if len(lines_yielded) == 1 and len(raw_chunks) > 1:
            # At least some chunks remain unconsumed
            assert len(chunks_consumed) < len(raw_chunks), (
                "All chunks consumed before first line yielded -- "
                "stream_csv_lines is materializing the full file"
            )

    # All lines eventually yielded
    assert lines_yielded == ["header", "row1", "row2", "row3"]


@pytest.mark.asyncio
async def test_no_trailing_newline():
    """File without trailing newline still yields the last line."""
    from app.services.import_service import stream_csv_lines

    csv_data = b"a,b\nc,d"  # No trailing newline
    storage = _make_mock_storage(csv_data, chunk_size=5)

    lines = []
    async for line in stream_csv_lines(storage, "test.csv"):
        lines.append(line)

    assert lines == ["a,b", "c,d"]
