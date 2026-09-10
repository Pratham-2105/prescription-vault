from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "Prescription Vault"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    LOG_LEVEL: str = "INFO"

    LOGIN_RATE_LIMIT: str = "5/minute"
    REGISTER_RATE_LIMIT: str = "10/hour"
    REFRESH_RATE_LIMIT: str = "20/minute"
    LOGOUT_RATE_LIMIT: str = "20/minute"

    # "local" writes to STORAGE_DIR; "r2" writes to Cloudflare R2.
    # A container filesystem does not survive redeploy, so any deployed
    # environment must use "r2".
    STORAGE_BACKEND: Literal["local", "r2"] = "local"
    STORAGE_DIR: str = "./storage"

    # Required when STORAGE_BACKEND == "r2", validated below.
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET: str | None = None

    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MB
    ALLOWED_UPLOAD_TYPES: set[str] = {
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/webp",
        "application/pdf",
    }

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    @model_validator(mode="after")
    def _require_r2_credentials(self) -> Self:
        # "local" writes to STORAGE_DIR; "s3" writes to S3-compatible object
        # storage. A container filesystem does not survive redeploy, so a
        # deployed "local" backend requires STORAGE_DIR to be a mounted volume.
        if self.STORAGE_BACKEND != "r2":
            return self

        missing = [
            name
            for name in (
                "R2_ACCOUNT_ID",
                "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY",
                "R2_BUCKET",
            )
            if not getattr(self, name)
        ]
        if missing:
            raise ValueError(f"STORAGE_BACKEND is 'r2' but these are unset: {', '.join(missing)}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
