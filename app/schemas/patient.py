import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PatientBase(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    relation: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = None
    blood_group: str | None = Field(default=None, max_length=8)
    allergies: str | None = None
    notes: str | None = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    relation: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = None
    blood_group: str | None = Field(default=None, max_length=8)
    allergies: str | None = None
    notes: str | None = None


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
