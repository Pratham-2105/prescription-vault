import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.prescription import Prescription
    from app.models.user import User


class Patient(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A person whose records are stored. 'Self', 'Mom', 'Dad', a child, etc."""

    __tablename__ = "patients"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(40))   # self / mother / son ...
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    blood_group: Mapped[str | None] = mapped_column(String(8))
    allergies: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    owner: Mapped["User"] = relationship(back_populates="patients")
    prescriptions: Mapped[list["Prescription"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )