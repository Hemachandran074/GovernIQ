"""Application configuration loaded from environment variables."""

import json
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    API_KEY: str = Field(default="dev-secret-key-12345")
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8000)
    ENVIRONMENT: str = Field(default="development")
    MAX_UPLOAD_SIZE_BYTES: int = Field(default=2 * 1024 * 1024)  # 2 MB
    CORS_ORIGINS: list[str] | str = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )

    # Neo4j Settings
    NEO4J_URI: str = Field(default="bolt://localhost:7687")
    NEO4J_USER: str = Field(default="neo4j")
    NEO4J_PASSWORD: str = Field(default="password")
    NEO4J_DATABASE: str = Field(default="neo4j")
    NEO4J_CONNECTION_TIMEOUT: float = Field(default=5.0)
    NEO4J_READ_USER: str = Field(default="")
    NEO4J_READ_PASSWORD: str = Field(default="")

    # LLM Settings
    LLM_PROVIDER: str = Field(default="groq")
    LLM_API_KEY: str = Field(default="")
    LLM_BASE_URL: str = Field(default="https://api.groq.com/openai/v1")
    LLM_MODEL: str = Field(default="llama-3.3-70b-versatile")

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, value: Any) -> list[str]:
        """Support comma-separated string, JSON array, or list of origins."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(v).strip() for v in parsed if str(v).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return ["http://localhost:5173", "http://localhost:3000"]

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS_ORIGINS as guaranteed list of strings."""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return self.assemble_cors_origins(self.CORS_ORIGINS)

    @property
    def effective_read_user(self) -> str:
        """Return read user, falling back to writer user if not configured."""
        return self.NEO4J_READ_USER if self.NEO4J_READ_USER else self.NEO4J_USER

    @property
    def effective_read_password(self) -> str:
        """Return read password, falling back to writer password if not configured."""
        return self.NEO4J_READ_PASSWORD if self.NEO4J_READ_PASSWORD else self.NEO4J_PASSWORD


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
