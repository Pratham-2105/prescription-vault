"""The upload pipeline strips metadata and rejects hostile input."""

import io
import warnings

import piexif
import pytest
from PIL import Image

from app.services.images import (
    JPEG,
    PDF,
    CorruptImageError,
    UnsupportedFileError,
    process_upload,
    sniff_content_type,
)


def _photo_with_gps(size: tuple[int, int] = (1200, 900)) -> bytes:
    """A JPEG carrying GPS coordinates, as a phone camera would produce."""
    image = Image.new("RGB", size, (200, 180, 160))
    exif = {
        "0th": {piexif.ImageIFD.Make: b"TestPhone"},
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((28, 1), (36, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"E",
            piexif.GPSIFD.GPSLongitude: ((77, 1), (12, 1), (0, 1)),
        },
        "Exif": {},
        "1st": {},
        "thumbnail": None,
    }
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=piexif.dump(exif))
    return buffer.getvalue()


def test_gps_coordinates_are_removed() -> None:
    """The reason this pipeline exists: a hospital geotag is health data."""
    original = _photo_with_gps()
    assert piexif.load(original)["GPS"], "fixture should start with GPS data"

    result = process_upload(original)

    assert not piexif.load(result.data)["GPS"]


def test_all_exif_is_removed() -> None:
    result = process_upload(_photo_with_gps())
    loaded = piexif.load(result.data)
    assert not loaded["0th"]
    assert not loaded["Exif"]


def test_orientation_is_applied_to_pixels() -> None:
    """
    Phones store portrait photos sideways with a rotation tag. Dropping the
    tag without rotating first leaves every portrait photo on its side.
    """
    image = Image.new("RGB", (400, 800), (10, 20, 30))
    exif = {
        "0th": {piexif.ImageIFD.Orientation: 6},
        "Exif": {},
        "GPS": {},
        "1st": {},
        "thumbnail": None,
    }
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=piexif.dump(exif))

    result = process_upload(buffer.getvalue())

    # Orientation 6 means "rotate 90° clockwise": 400x800 becomes 800x400.
    assert result.width == 800
    assert result.height == 400


def test_large_image_is_capped() -> None:
    image = Image.new("RGB", (5000, 4000), (128, 128, 128))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")

    result = process_upload(buffer.getvalue())

    assert max(result.width or 0, result.height or 0) == 2400


def test_thumbnail_is_generated_and_small() -> None:
    result = process_upload(_photo_with_gps())

    assert result.thumbnail is not None
    with Image.open(io.BytesIO(result.thumbnail)) as thumb:
        assert max(thumb.size) == 400
    assert len(result.thumbnail) < len(result.data)


def test_png_is_converted_to_jpeg() -> None:
    image = Image.new("RGBA", (600, 400), (255, 0, 0, 128))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    result = process_upload(buffer.getvalue())

    assert result.content_type == JPEG
    assert result.data.startswith(b"\xff\xd8\xff")


def test_pdf_passes_through_unchanged() -> None:
    raw = b"%PDF-1.4\n%fake pdf body\n"
    result = process_upload(raw)

    assert result.content_type == PDF
    assert result.data == raw
    assert result.thumbnail is None


def test_declared_type_is_ignored_in_favour_of_content() -> None:
    """
    An executable renamed and declared as image/jpeg must still be rejected.
    This is the whole point of sniffing.
    """
    with pytest.raises(UnsupportedFileError):
        sniff_content_type(b"MZ\x90\x00\x03\x00\x00\x00")


def test_script_disguised_as_image_is_rejected() -> None:
    with pytest.raises(UnsupportedFileError):
        process_upload(b"<?php system($_GET['c']); ?>")


def test_empty_file_is_rejected() -> None:
    with pytest.raises(UnsupportedFileError):
        process_upload(b"")


def test_truncated_jpeg_is_rejected() -> None:
    full = _photo_with_gps()
    with pytest.raises(CorruptImageError):
        process_upload(full[: len(full) // 3])


def test_heic_is_decoded() -> None:
    """iPhones shoot HEIC; it must survive the pipeline like any other image."""
    buffer = io.BytesIO()
    Image.new("RGB", (800, 600), (100, 120, 140)).save(buffer, format="HEIF")

    result = process_upload(buffer.getvalue())

    assert result.content_type == JPEG
    assert result.width == 800


def test_oversized_dimensions_are_rejected_before_decoding() -> None:
    """
    A small file can declare enormous dimensions. The 10 MB request cap does
    not protect against this; the pixel count check does.
    """
    image = Image.new("RGB", (9000, 9000), (0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=1)

    # Pillow warns on open, before our check runs. Expected here.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", Image.DecompressionBombWarning)
        with pytest.raises(UnsupportedFileError):
            process_upload(buffer.getvalue())
