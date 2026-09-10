import asyncio
import uuid
from abc import ABC, abstractmethod
from datetime import date
from functools import cached_property
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - import cost only paid by type checkers
    from mypy_boto3_s3.client import S3Client


class ObjectNotFoundError(Exception):
    """The key is not present in the backend."""


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, data: bytes, *, key: str) -> None: ...

    @abstractmethod
    async def load(self, key: str) -> bytes:
        """
        Read an object back.

        Raises ObjectNotFoundError when the key is absent. Every backend must
        implement this: local_path() only exists for backends that happen to
        sit on a filesystem, so it cannot be the only read path.
        """

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

    async def load(self, key: str) -> bytes:
        target = self._resolve(key)
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise ObjectNotFoundError(key) from exc

    async def delete(self, key: str) -> None:
        target = self._resolve(key)
        target.unlink(missing_ok=True)

    def local_path(self, key: str) -> Path | None:
        target = self._resolve(key)
        return target if target.exists() else None


class R2Storage(StorageBackend):
    """
    Cloudflare R2 through its S3-compatible API.

    Why boto3 wrapped in asyncio.to_thread rather than an async S3 client:
    boto3 is synchronous, and a blocking call inside an async endpoint holds
    the event loop for the whole round trip — every other in-flight request
    stalls behind it, not just this one. to_thread hands the call to a worker
    thread so the loop stays free. The alternative, aioboto3, is a smaller
    project that trails boto3's releases; four wrapped calls is a cheaper
    dependency than that.
    """

    def __init__(
        self,
        *,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
    ) -> None:
        self._endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._bucket = bucket

    @cached_property
    def _client(self) -> "S3Client":
        # Imported lazily so a deployment running LocalStorage does not need
        # boto3 installed at all.
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            # R2 has no regions; the S3 protocol requires the field anyway.
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

    def _put(self, data: bytes, key: str) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data)

    def _get(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            # No annotation: the stubs return a TypedDict with known keys,
            # which is more precise than anything worth writing by hand.
            response = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            # R2 returns NoSuchKey for a missing object, 404 for a HEAD-style
            # miss. Anything else is a real failure and should surface.
            if code in {"NoSuchKey", "404"}:
                raise ObjectNotFoundError(key) from exc
            raise
        return response["Body"].read()

    def _delete(self, key: str) -> None:
        # S3 delete is idempotent: deleting an absent key succeeds.
        self._client.delete_object(Bucket=self._bucket, Key=key)

    async def save(self, data: bytes, *, key: str) -> None:
        await asyncio.to_thread(self._put, data, key)

    async def load(self, key: str) -> bytes:
        return await asyncio.to_thread(self._get, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete, key)

    def local_path(self, key: str) -> Path | None:  # noqa: ARG002 - interface parameter
        """
        Object storage has no filesystem path. Callers must use load().

        `key` is unused by design: the signature is fixed by StorageBackend,
        and renaming it to `_key` would break keyword calls against the ABC.
        """
        return None
