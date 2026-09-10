import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.medication import Medication
from app.models.patient import Patient
from app.models.prescription import Attachment, Prescription
from app.models.user import User
from app.services.storage import LocalStorage, R2Storage, StorageBackend

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")

DbSession = Annotated[AsyncSession, Depends(get_db)]


def _build_storage() -> StorageBackend:
    """
    Chosen once at import. config.py has already checked that the R2
    credentials are present, so the assertions below only narrow the types
    for mypy — they are not the real validation.
    """
    if settings.STORAGE_BACKEND == "r2":
        assert settings.R2_ACCOUNT_ID is not None
        assert settings.R2_ACCESS_KEY_ID is not None
        assert settings.R2_SECRET_ACCESS_KEY is not None
        assert settings.R2_BUCKET is not None
        return R2Storage(
            account_id=settings.R2_ACCOUNT_ID,
            access_key_id=settings.R2_ACCESS_KEY_ID,
            secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            bucket=settings.R2_BUCKET,
        )
    return LocalStorage(settings.STORAGE_DIR)


_storage = _build_storage()


def get_storage() -> StorageBackend:
    return _storage


Storage = Annotated[StorageBackend, Depends(get_storage)]


async def get_current_user(
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_error

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise credentials_error from None

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_owned_patient(
    patient_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> Patient:
    patient = await db.get(Patient, patient_id)
    if patient is None or patient.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return patient


OwnedPatient = Annotated[Patient, Depends(get_owned_patient)]


async def get_owned_prescription(
    prescription_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> Prescription:
    stmt = (
        select(Prescription)
        .join(Patient, Patient.id == Prescription.patient_id)
        .where(Prescription.id == prescription_id, Patient.owner_id == user.id)
    )
    prescription = (await db.execute(stmt)).scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prescription not found")
    return prescription


OwnedPrescription = Annotated[Prescription, Depends(get_owned_prescription)]


async def get_owned_attachment(
    attachment_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> Attachment:
    stmt = (
        select(Attachment)
        .join(Prescription, Prescription.id == Attachment.prescription_id)
        .join(Patient, Patient.id == Prescription.patient_id)
        .where(Attachment.id == attachment_id, Patient.owner_id == user.id)
    )
    attachment = (await db.execute(stmt)).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return attachment


OwnedAttachment = Annotated[Attachment, Depends(get_owned_attachment)]


async def get_owned_medication(
    medication_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> Medication:
    stmt = (
        select(Medication)
        .join(Prescription, Prescription.id == Medication.prescription_id)
        .join(Patient, Patient.id == Prescription.patient_id)
        .where(Medication.id == medication_id, Patient.owner_id == user.id)
    )
    medication = (await db.execute(stmt)).scalar_one_or_none()
    if medication is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medication not found")
    return medication


OwnedMedication = Annotated[Medication, Depends(get_owned_medication)]
