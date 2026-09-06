import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.medication import MedicationRead


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str | None
    content_type: str
    size_bytes: int
    page_number: int
    created_at: datetime
    # Derived from Attachment.has_thumbnail. storage_key and thumbnail_key
    # are deliberately absent — keys are opaque and never leave the server.
    has_thumbnail: bool


class PrescriptionBase(BaseModel):
    visit_date: date
    doctor_name: str | None = Field(default=None, max_length=160)
    clinic_name: str | None = Field(default=None, max_length=200)
    specialty: str | None = Field(default=None, max_length=80)
    reason: str | None = Field(default=None, max_length=300)
    notes: str | None = None


class PrescriptionCreate(PrescriptionBase):
    patient_id: uuid.UUID


class PrescriptionUpdate(BaseModel):
    visit_date: date | None = None
    doctor_name: str | None = Field(default=None, max_length=160)
    clinic_name: str | None = Field(default=None, max_length=200)
    specialty: str | None = Field(default=None, max_length=80)
    reason: str | None = Field(default=None, max_length=300)
    notes: str | None = None


class PrescriptionRead(PrescriptionBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    ocr_status: str
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead] = []
    medications: list[MedicationRead] = []


class PrescriptionListItem(BaseModel):
    """Lightweight row for the timeline screen."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    visit_date: date
    doctor_name: str | None
    clinic_name: str | None
    reason: str | None
    attachment_count: int = 0
    medication_count: int = 0


class PrescriptionPage(BaseModel):
    items: list[PrescriptionListItem]
    total: int
    limit: int
    offset: int
