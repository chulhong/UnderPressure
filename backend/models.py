"""Pydantic models for BP records and API requests/responses."""

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _validate_bp(value: Optional[int], name: str) -> Optional[int]:
    """SBP/DBP must be positive integer in range 40-250."""
    if value is None:
        return None
    if not isinstance(value, int) or value < 40 or value > 250:
        raise ValueError(f"{name} must be an integer between 40 and 250")
    return value


class BPRecord(BaseModel):
    """Single day blood pressure record."""

    date: date
    morning_sbp: Optional[int] = None
    morning_dbp: Optional[int] = None
    evening_sbp: Optional[int] = None
    evening_dbp: Optional[int] = None
    note: str = ""
    device: Optional[str] = None

    @field_validator("morning_sbp", "morning_dbp", "evening_sbp", "evening_dbp")
    @classmethod
    def validate_bp_range(cls, v: Optional[int], info) -> Optional[int]:
        if v is None:
            return None
        return _validate_bp(v, info.field_name)

    def has_any_measurement(self) -> bool:
        """True if at least one SBP/DBP is set."""
        return any(
            x is not None
            for x in (
                self.morning_sbp,
                self.morning_dbp,
                self.evening_sbp,
                self.evening_dbp,
            )
        )


class BPRecordCreate(BaseModel):
    """Payload for creating/updating a record."""

    morning_sbp: Optional[int] = None
    morning_dbp: Optional[int] = None
    evening_sbp: Optional[int] = None
    evening_dbp: Optional[int] = None
    note: str = ""
    device: Optional[str] = None

    @field_validator("morning_sbp", "morning_dbp", "evening_sbp", "evening_dbp")
    @classmethod
    def validate_bp_range(cls, v: Optional[int], info) -> Optional[int]:
        if v is None:
            return None
        return _validate_bp(v, info.field_name)


class ReportRequest(BaseModel):
    """Request body for PDF report."""

    from_date: date = Field(..., alias="from")
    to_date: date = Field(..., alias="to")

    model_config = {"populate_by_name": True}
