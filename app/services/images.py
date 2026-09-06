"""
Upload sanitisation: type detection from content, re-encoding, thumbnails.

Two jobs. First, decide what a file actually is by reading its bytes — the
client-declared content type is attacker-controlled and cannot be trusted.
Second, re-encode images through Pillow, which drops every metadata field
including EXIF GPS. A prescription photo carries the coordinates of the
clinic where it was taken; that is health data, and it does not belong in
storage.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Final

from PIL import Image, ImageOps, UnidentifiedImageError

# A 100MP "image" that decompresses to gigabytes of RAM is a cheap DoS.
# Pillow warns above this by default; we make it an error instead.
Image.MAX_IMAGE_PIXELS = 50_000_000

MAX_DIMENSION: Final = 2400
THUMBNAIL_DIMENSION: Final = 400
JPEG_QUALITY: Final = 85
THUMBNAIL_QUALITY: Final = 75

JPEG: Final = "image/jpeg"
PNG: Final = "image/png"
WEBP: Final = "image/webp"
HEIC: Final = "image/heic"
PDF: Final = "application/pdf"


class UnsupportedFileError(Exception):
    """The bytes are not a file type we accept."""


class CorruptImageError(Exception):
    """The type was recognised but the image could not be decoded."""


@dataclass(frozen=True)
class ProcessedUpload:
    """What the upload handler stores. `thumbnail` is None for PDFs."""

    data: bytes
    content_type: str
    thumbnail: bytes | None
    width: int | None
    height: int | None


def sniff_content_type(raw: bytes) -> str:
    """
    Identify a file from its magic bytes.

    Raises UnsupportedFileError for anything not on the list — including
    files whose declared content type says otherwise.
    """
    if raw.startswith(b"\xff\xd8\xff"):
        return JPEG
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return WEBP
    # ISO base media format: a size prefix, then 'ftyp', then a brand.
    if raw[4:8] == b"ftyp" and raw[8:12] in (
        b"heic",
        b"heix",
        b"hevc",
        b"heim",
        b"heis",
        b"mif1",
        b"msf1",
    ):
        return HEIC
    if raw.startswith(b"%PDF-"):
        return PDF
    raise UnsupportedFileError("Unsupported or unrecognised file type")


def process_upload(raw: bytes) -> ProcessedUpload:
    """
    Sniff, then normalise. Images are re-encoded as JPEG with all metadata
    discarded and a thumbnail generated. PDFs pass through untouched.
    """
    if not raw:
        raise UnsupportedFileError("Empty file")

    declared = sniff_content_type(raw)

    if declared == PDF:
        # PDFs can carry metadata too, but rewriting them needs a different
        # library and risks corrupting scans. Out of scope; noted in §11.
        return ProcessedUpload(data=raw, content_type=PDF, thumbnail=None, width=None, height=None)

    try:
        with Image.open(io.BytesIO(raw)) as source:
            # Rotate the pixels to match the EXIF orientation tag BEFORE the
            # metadata is dropped, or every portrait photo ends up sideways.
            image = ImageOps.exif_transpose(source)

            # If exif_transpose returns None, use the original source image
            if image is None:
               image = source

            # Flatten transparency and drop palettes: JPEG has neither.
            if image.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", image.size, (255, 255, 255))
                converted = image.convert("RGBA")
                background.paste(converted, mask=converted.split()[-1])
                image = background
            elif image.mode != "RGB":
                image = image.convert("RGB")

            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
            width, height = image.size

            full = io.BytesIO()
            # No exif= argument: this save is the metadata strip.
            image.save(full, format="JPEG", quality=JPEG_QUALITY, optimize=True)

            preview = image.copy()
            preview.thumbnail((THUMBNAIL_DIMENSION, THUMBNAIL_DIMENSION), Image.Resampling.LANCZOS)
            thumb = io.BytesIO()
            preview.save(thumb, format="JPEG", quality=THUMBNAIL_QUALITY, optimize=True)

    except UnidentifiedImageError as exc:
        raise CorruptImageError("File could not be read as an image") from exc
    except Image.DecompressionBombError as exc:
        raise UnsupportedFileError("Image dimensions are implausibly large") from exc
    except OSError as exc:
        # Pillow raises bare OSError for truncated files.
        raise CorruptImageError("Image data is incomplete or corrupt") from exc

    return ProcessedUpload(
        data=full.getvalue(),
        content_type=JPEG,
        thumbnail=thumb.getvalue(),
        width=width,
        height=height,
    )
