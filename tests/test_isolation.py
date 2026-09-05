from typing import Any

from httpx import AsyncClient


async def test_cannot_read_another_users_patient(
    client: AsyncClient, patient: dict[str, Any], other_auth_headers: dict[str, str]
) -> None:
    resp = await client.get(f"/patients/{patient['id']}", headers=other_auth_headers)
    assert resp.status_code == 404


async def test_cannot_read_another_users_prescription(
    client: AsyncClient,
    prescription: dict[str, Any],
    other_auth_headers: dict[str, str],
) -> None:
    resp = await client.get(
        f"/prescriptions/{prescription['id']}", headers=other_auth_headers
    )
    assert resp.status_code == 404


async def test_cannot_update_another_users_prescription(
    client: AsyncClient,
    prescription: dict[str, Any],
    other_auth_headers: dict[str, str],
) -> None:
    resp = await client.patch(
        f"/prescriptions/{prescription['id']}",
        json={"doctor_name": "Hacked"},
        headers=other_auth_headers,
    )
    assert resp.status_code == 404


async def test_cannot_delete_another_users_prescription(
    client: AsyncClient,
    prescription: dict[str, Any],
    other_auth_headers: dict[str, str],
) -> None:
    resp = await client.delete(
        f"/prescriptions/{prescription['id']}", headers=other_auth_headers
    )
    assert resp.status_code == 404


async def test_cannot_attach_file_to_another_users_prescription(
    client: AsyncClient,
    prescription: dict[str, Any],
    other_auth_headers: dict[str, str],
) -> None:
    resp = await client.post(
        f"/prescriptions/{prescription['id']}/attachments",
        files={"file": ("x.jpg", b"fake", "image/jpeg")},
        headers=other_auth_headers,
    )
    assert resp.status_code == 404


async def test_cannot_create_prescription_for_another_users_patient(
    client: AsyncClient, patient: dict[str, Any], other_auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/prescriptions",
        json={"patient_id": patient["id"], "visit_date": "2026-09-01"},
        headers=other_auth_headers,
    )
    assert resp.status_code == 404


async def test_others_prescriptions_absent_from_list(
    client: AsyncClient,
    prescription: dict[str, Any],
    other_auth_headers: dict[str, str],
) -> None:
    resp = await client.get("/prescriptions", headers=other_auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0