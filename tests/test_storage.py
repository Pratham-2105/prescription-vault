import uuid
from pathlib import Path

import pytest

from app.services.storage import LocalStorage, build_key


async def test_rejects_path_traversal(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        await storage.save(b"pwned", key="../../../etc/passwd")


async def test_roundtrip(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    await storage.save(b"hello", key="a/b/c.jpg")
    path = storage.local_path("a/b/c.jpg")
    assert path is not None
    assert path.read_bytes() == b"hello"


async def test_delete_is_idempotent(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    await storage.delete("does/not/exist.jpg")  # must not raise


async def test_keys_are_unique_per_upload() -> None:
    """Two uploads never collide, even for the same prescription."""
    user_id = uuid.uuid4()
    prescription_id = uuid.uuid4()

    first = build_key(user_id=user_id, prescription_id=prescription_id, content_type="image/jpeg")
    second = build_key(user_id=user_id, prescription_id=prescription_id, content_type="image/jpeg")

    assert first != second
    assert first.endswith(".jpg")
