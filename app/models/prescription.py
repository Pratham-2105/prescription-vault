import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.medication import Medication
    from app.models.patient import Patient

OCR_PENDING = "pending"
OCR_DONE = "done"
OCR_FAILED = "failed"
OCR_SKIPPED = "skipped"


class Prescription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "prescriptions"

    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False
    )

    visit_date: Mapped[date] = mapped_column(index=True, nullable=False)
    doctor_name: Mapped[str | None] = mapped_column(String(160), index=True)
    clinic_name: Mapped[str | None] = mapped_column(String(200), index=True)
    specialty: Mapped[str | None] = mapped_column(String(80))
    reason: Mapped[str | None] = mapped_column(String(300))   # "fever, 4 days"
    notes: Mapped[str | None] = mapped_column(Text)

    # Populated later by the OCR pipeline.
    ocr_status: Mapped[str] = mapped_column(String(16), default=OCR_SKIPPED, nullable=False)
    ocr_text: Mapped[str | None] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="prescriptions")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="prescription",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Attachment.page_number",
    )
    medications: Mapped[list["Medication"]] = relationship(
        back_populates="prescription",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class Attachment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One scanned page/photo belonging to a prescription."""

    __tablename__ = "attachments"

    prescription_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    prescription: Mapped["Prescription"] = relationship(back_populates="attachments")