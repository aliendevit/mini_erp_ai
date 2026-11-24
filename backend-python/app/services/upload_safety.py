from __future__ import annotations

from fastapi import HTTPException, UploadFile, status


async def read_upload_limited(upload: UploadFile, max_bytes: int, *, chunk_size: int = 1024 * 1024) -> bytes:
    """Read an uploaded file incrementally and stop before retaining an oversized payload."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Uploaded file is too large.")
        chunks.append(chunk)
    return b"".join(chunks)
