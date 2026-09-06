import io
from typing import Any

import piexif
from httpx import AsyncClient
from PIL import Image


def _jpeg_bytes(size: tuple[int, int] = (600, 400)) -> bytes:
    """
    A real, decodable JPEG. Uploads are now re-encoded through Pillow, so a
    stub with a valid header and junk body is rejected as corrupt.
    """
    buffer = io.BytesIO()
    Image.new("RGB", size, (150, 150, 150)).save(buffer, format="JPEG")
    return buffer.getvalue()


def _photo_with_gps(size: tuple[int, int] = (1200, 900)) -> bytes:
    """A JPEG carrying GPS coordinates, as a phone camera would produce."""
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
    Image.new("RGB", size, (200, 180, 160)).save(buffer, format="JPEG", exif=piexif.dump(exif))
    return buffer.getvalue()


JPEG = ("scan.jpg", _jpeg_bytes(), "image/jpeg")


async def test_create_and_fetch_prescription(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    resp = await client.get(f"/prescriptions/{prescription['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["doctor_name"] == "Dr. Sharma"


async def test_timeline_is_ordered_newest_visit_first(
    client: AsyncClient, auth_headers: dict[str, str], patient: dict[str, Any]
) -> None:
    for visit_date in ["2026-01-15", "2026-08-20", "2026-04-02"]:
        await client.post(
            "/prescriptions",
            json={"patient_id": patient["id"], "visit_date": visit_date},
            headers=auth_headers,
        )

    resp = await client.get("/prescriptions", headers=auth_headers)
    dates = [item["visit_date"] for item in resp.json()["items"]]
    assert dates == sorted(dates, reverse=True)


async def test_list_counts_attachments_and_medications(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": JPEG},
        headers=auth_headers,
    )
    await client.post(
        f"/prescriptions/{prescription['id']}/medications",
        json={"name": "Azithral", "frequency_code": "1-0-1"},
        headers=auth_headers,
    )

    resp = await client.get("/prescriptions", headers=auth_headers)
    item = resp.json()["items"][0]
    assert item["attachment_count"] == 1
    assert item["medication_count"] == 1


async def test_search_matches_doctor_name(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    hit = await client.get("/prescriptions?q=sharma", headers=auth_headers)
    assert hit.json()["total"] == 1

    miss = await client.get("/prescriptions?q=nonexistent", headers=auth_headers)
    assert miss.json()["total"] == 0


async def test_date_range_filter(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    inside = await client.get(
        "/prescriptions?date_from=2026-08-01&date_to=2026-09-30", headers=auth_headers
    )
    assert inside.json()["total"] == 1

    outside = await client.get("/prescriptions?date_from=2026-10-01", headers=auth_headers)
    assert outside.json()["total"] == 0


async def test_pagination_caps_limit(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/prescriptions?limit=5000", headers=auth_headers)
    assert resp.status_code == 422


async def test_upload_rejects_disallowed_type(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("evil.exe", b"MZ\x90\x00\x03\x00", "application/x-msdownload")},
        headers=auth_headers,
    )
    assert resp.status_code == 415


async def test_declared_content_type_cannot_smuggle_a_file(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    """
    The point of magic-byte sniffing: a payload claiming to be a JPEG is
    still rejected, because the decision comes from the bytes.
    """
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("photo.jpg", b"<?php system($_GET['c']); ?>", "image/jpeg")},
        headers=auth_headers,
    )
    assert resp.status_code == 415


async def test_upload_rejects_empty_file(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
        headers=auth_headers,
    )
    assert resp.status_code == 415


async def test_attachments_get_sequential_page_numbers(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    pages = []
    for _ in range(3):
        resp = await client.post(
            f"/prescriptions/{prescription['id']}/attachments",
            files={"file": JPEG},
            headers=auth_headers,
        )
        pages.append(resp.json()["page_number"])
    assert pages == [1, 2, 3]


async def test_attachment_response_hides_storage_key(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": JPEG},
        headers=auth_headers,
    )
    body = resp.json()

    assert "storage_key" not in body
    assert "thumbnail_key" not in body
    assert body["has_thumbnail"] is True


async def test_download_returns_a_valid_image(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    """
    Uploads are re-encoded, so the stored bytes differ from what was sent.
    What matters is that the result is a readable JPEG of the same picture.
    """
    original = _jpeg_bytes((800, 600))

    upload = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("scan.jpg", original, "image/jpeg")},
        headers=auth_headers,
    )
    attachment_id = upload.json()["id"]

    resp = await client.get(f"/attachments/{attachment_id}/file", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.content != original, "bytes should have been re-encoded"
    with Image.open(io.BytesIO(resp.content)) as img:
        assert img.size == (800, 600)


async def test_uploaded_photo_has_no_gps(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    """End-to-end version of the check in test_images.py."""
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("photo.jpg", _photo_with_gps(), "image/jpeg")},
        headers=auth_headers,
    )
    attachment_id = resp.json()["id"]

    stored = await client.get(f"/attachments/{attachment_id}/file", headers=auth_headers)

    assert not piexif.load(stored.content)["GPS"]


async def test_thumbnail_is_served(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    upload = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("scan.jpg", _jpeg_bytes((2000, 1500)), "image/jpeg")},
        headers=auth_headers,
    )
    attachment_id = upload.json()["id"]

    resp = await client.get(f"/attachments/{attachment_id}/thumbnail", headers=auth_headers)

    assert resp.status_code == 200
    with Image.open(io.BytesIO(resp.content)) as thumb:
        assert max(thumb.size) == 400


async def test_deleting_prescription_cascades(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    med = await client.post(
        f"/prescriptions/{prescription['id']}/medications",
        json={"name": "Azithral"},
        headers=auth_headers,
    )
    med_id = med.json()["id"]

    await client.delete(f"/prescriptions/{prescription['id']}", headers=auth_headers)

    assert (
        await client.get(f"/prescriptions/{prescription['id']}", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.patch(f"/medications/{med_id}", json={"name": "X"}, headers=auth_headers)
    ).status_code == 404


async def test_patch_only_updates_sent_fields(
    client: AsyncClient, prescription: dict[str, Any], auth_headers: dict[str, str]
) -> None:
    resp = await client.patch(
        f"/prescriptions/{prescription['id']}",
        json={"doctor_name": "Dr. Verma"},
        headers=auth_headers,
    )
    body = resp.json()
    assert body["doctor_name"] == "Dr. Verma"
    assert body["clinic_name"] == "City Clinic"
