from fastapi import APIRouter, status

from app.api.deps import DbSession, OwnedMedication, OwnedPrescription
from app.models.medication import Medication
from app.schemas.medication import MedicationCreate, MedicationRead, MedicationUpdate

router = APIRouter(tags=["medications"])


@router.post(
    "/prescriptions/{prescription_id}/medications",
    response_model=MedicationRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_medication(
    payload: MedicationCreate, prescription: OwnedPrescription, db: DbSession
) -> Medication:
    medication = Medication(**payload.model_dump(), prescription_id=prescription.id)
    db.add(medication)
    await db.commit()
    await db.refresh(medication)
    return medication


@router.get(
    "/prescriptions/{prescription_id}/medications",
    response_model=list[MedicationRead],
)
async def list_medications(prescription: OwnedPrescription) -> list[Medication]:
    return prescription.medications


@router.patch("/medications/{medication_id}", response_model=MedicationRead)
async def update_medication(
    payload: MedicationUpdate, medication: OwnedMedication, db: DbSession
) -> Medication:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(medication, field, value)
    await db.commit()
    await db.refresh(medication)
    return medication


@router.delete("/medications/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(medication: OwnedMedication, db: DbSession) -> None:
    await db.delete(medication)
    await db.commit()
