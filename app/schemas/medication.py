import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FoodRelation = Literal["before_food", "after_food", "with_food", "any"]


class MedicationBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    strength: str | None = Field(default=None, max_length=60)
    form: str | None = Field(default=None, max_length=40)
    frequency_code: str | None = Field(default=None, max_length=20)
    food_relation: FoodRelation | None = None
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    start_date: date | None = None
    instructions: str | None = None


class MedicationCreate(MedicationBase):
    pass


class MedicationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    strength: str | None = None
    form: str | None = None
    frequency_code: str | None = None
    food_relation: FoodRelation | None = None
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    start_date: date | None = None
    instructions: str | None = None
    is_active: bool | None = None


class MedicationRead(MedicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prescription_id: uuid.UUID
    is_active: bool
    created_at: datetime