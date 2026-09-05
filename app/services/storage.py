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


def build_key(*, user_id: uuid.UUID, prescription_id: uuid.UUID, filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()[:10] or ".bin"
    today = date.today()
    return f"{user_id}/{today:%Y/%m}/{prescription_id}/{uuid.uuid4().hex}{suffix}"


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
