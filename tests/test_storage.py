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


def test_keys_are_unique_per_upload() -> None:
    import uuid

    args = {"user_id": uuid.uuid4(), "prescription_id": uuid.uuid4(), "filename": "x.jpg"}
    assert build_key(**args) != build_key(**args)
