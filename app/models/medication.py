import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.prescription import Prescription


class Medication(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "medications"

    prescription_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)  # "Azithral"
    strength: Mapped[str | None] = mapped_column(String(60))  # "500 mg"
    form: Mapped[str | None] = mapped_column(String(40))  # tablet / syrup
    frequency_code: Mapped[str | None] = mapped_column(String(20))  # "1-0-1"
    food_relation: Mapped[str | None] = mapped_column(String(20))  # before/after/with
    duration_days: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None]
    instructions: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    prescription: Mapped["Prescription"] = relationship(back_populates="medications")
