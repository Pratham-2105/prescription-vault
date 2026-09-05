import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.api.deps import (
    CurrentUser,
    DbSession,
    OwnedAttachment,
    OwnedPrescription,
    Storage,
)
from app.core.config import settings
from app.models.medication import Medication
from app.models.patient import Patient
from app.models.prescription import Attachment, Prescription
from app.schemas.prescription import (
    AttachmentRead,
    PrescriptionCreate,
    PrescriptionListItem,
    PrescriptionPage,
    PrescriptionRead,
    PrescriptionUpdate,
)
from app.services.storage import build_key

router = APIRouter(tags=["prescriptions"])


@router.post(
    "/prescriptions",
    response_model=PrescriptionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_prescription(
    payload: PrescriptionCreate, db: DbSession, user: CurrentUser
) -> Prescription:
    patient = await db.get(Patient, payload.patient_id)
    if patient is None or patient.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    prescription = Prescription(**payload.model_dump())
    db.add(prescription)
    await db.commit()
    await db.refresh(prescription)
    return prescription


@router.get("/prescriptions", response_model=PrescriptionPage)
async def list_prescriptions(
    db: DbSession,
    user: CurrentUser,
    patient_id: uuid.UUID | None = None,
    doctor: str | None = None,
    clinic: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PrescriptionPage:
    attachment_count = (
        select(func.count(Attachment.id))
        .where(Attachment.prescription_id == Prescription.id)
        .scalar_subquery()
    )
    medication_count = (
        select(func.count(Medication.id))
        .where(Medication.prescription_id == Prescription.id)
        .scalar_subquery()
    )

    base = (
        select(Prescription)
        .join(Patient, Patient.id == Prescription.patient_id)
        .where(Patient.owner_id == user.id)
    )

    if patient_id is not None:
        base = base.where(Prescription.patient_id == patient_id)
    if doctor:
        base = base.where(Prescription.doctor_name.ilike(f"%{doctor}%"))
    if clinic:
        base = base.where(Prescription.clinic_name.ilike(f"%{clinic}%"))
    if date_from:
        base = base.where(Prescription.visit_date >= date_from)
    if date_to:
        base = base.where(Prescription.visit_date <= date_to)
    if q:
        pattern = f"%{q}%"
        base = base.where(
            or_(
                Prescription.doctor_name.ilike(pattern),
                Prescription.clinic_name.ilike(pattern),
                Prescription.reason.ilike(pattern),
                Prescription.notes.ilike(pattern),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    rows_stmt = (
        base.add_columns(
            attachment_count.label("attachment_count"),
            medication_count.label("medication_count"),
        )
        .order_by(Prescription.visit_date.desc(), Prescription.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    items = [
        PrescriptionListItem(
            id=p.id,
            patient_id=p.patient_id,
            visit_date=p.visit_date,
            doctor_name=p.doctor_name,
            clinic_name=p.clinic_name,
            reason=p.reason,
            attachment_count=a_count,
            medication_count=m_count,
        )
        for p, a_count, m_count in (await db.execute(rows_stmt)).all()
    ]

    return PrescriptionPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/prescriptions/{prescription_id}", response_model=PrescriptionRead)
async def get_prescription(prescription: OwnedPrescription) -> Prescription:
    return prescription


@router.patch("/prescriptions/{prescription_id}", response_model=PrescriptionRead)
async def update_prescription(
    payload: PrescriptionUpdate, prescription: OwnedPrescription, db: DbSession
) -> Prescription:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prescription, field, value)
    await db.commit()
    await db.refresh(prescription)
    return prescription


@router.delete(
    "/prescriptions/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_prescription(
    prescription: OwnedPrescription, db: DbSession, storage: Storage
) -> None:
    keys = [a.storage_key for a in prescription.attachments]
    await db.delete(prescription)
    await db.commit()
    for key in keys:
        await storage.delete(key)


@router.post(
    "/prescriptions/{prescription_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    prescription: OwnedPrescription,
    db: DbSession,
    user: CurrentUser,
    storage: Storage,
    file: Annotated[UploadFile, File()],
) -> Attachment:
    if file.content_type not in settings.ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type: {file.content_type}",
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )

    next_page = (
        await db.scalar(
            select(func.coalesce(func.max(Attachment.page_number), 0)).where(
                Attachment.prescription_id == prescription.id
            )
        )
    ) or 0

    key = build_key(
        user_id=user.id, prescription_id=prescription.id, filename=file.filename
    )
    await storage.save(data, key=key)

    attachment = Attachment(
        prescription_id=prescription.id,
        storage_key=key,
        original_filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        page_number=next_page + 1,
    )
    db.add(attachment)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await storage.delete(key)   # don't leave an orphaned file on disk
        raise
    await db.refresh(attachment)
    return attachment


@router.get("/attachments/{attachment_id}/file")
async def download_attachment(
    attachment: OwnedAttachment, storage: Storage
) -> FileResponse:
    path = storage.local_path(attachment.storage_key)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing from storage")
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.original_filename or "prescription",
    )


@router.delete(
    "/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_attachment(
    attachment: OwnedAttachment, db: DbSession, storage: Storage
) -> None:
    key = attachment.storage_key
    await db.delete(attachment)
    await db.commit()
    await storage.delete(key)