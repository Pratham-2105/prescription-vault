from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, OwnedPatient
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientRead, PatientUpdate

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
async def create_patient(payload: PatientCreate, db: DbSession, user: CurrentUser) -> Patient:
    patient = Patient(**payload.model_dump(), owner_id=user.id)
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    return patient


@router.get("", response_model=list[PatientRead])
async def list_patients(db: DbSession, user: CurrentUser) -> list[Patient]:
    stmt = select(Patient).where(Patient.owner_id == user.id).order_by(Patient.created_at)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{patient_id}", response_model=PatientRead)
async def get_patient(patient: OwnedPatient) -> Patient:
    return patient


@router.patch("/{patient_id}", response_model=PatientRead)
async def update_patient(
    payload: PatientUpdate, patient: OwnedPatient, db: DbSession
) -> Patient:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    await db.commit()
    await db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(patient: OwnedPatient, db: DbSession) -> None:
    await db.delete(patient)
    await db.commit()