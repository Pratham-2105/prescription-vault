import uuid
from abc import ABC, abstractmethod
from datetime import date
from pathlib import Path


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, data: bytes, *, key: str) -> None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    def local_path(self, key: str) -> Path | None:
        """Filesystem path if the backend has one, else None."""


_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "application/pdf": ".pdf",
}


def build_key(*, user_id: uuid.UUID, prescription_id: uuid.UUID, content_type: str) -> str:
    """
    Extension comes from the sniffed content type, never the client filename.
    A filename is attacker-controlled and, after re-encoding, no longer
    describes what is actually on disk.
    """
    suffix = _EXTENSIONS.get(content_type, ".bin")
    today = date.today()
    return f"{user_id}/{today:%Y/%m}/{prescription_id}/{uuid.uuid4().hex}{suffix}"


def thumbnail_key_for(key: str) -> str:
    """Sibling key for the preview image: `<name>.jpg` -> `<name>_thumb.jpg`."""
    path = Path(key)
    return str(path.with_name(f"{path.stem}_thumb.jpg")).replace("\\", "/")


class LocalStorage(StorageBackend):
    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        target = (self._root / key).resolve()

        if not target.is_relative_to(self._root):
            raise ValueError("Invalid storage key")
        return target

    async def save(self, data: bytes, *, key: str) -> None:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    async def delete(self, key: str) -> None:
        target = self._resolve(key)
        target.unlink(missing_ok=True)

    def local_path(self, key: str) -> Path | None:
        target = self._resolve(key)
        return target if target.exists() else None
