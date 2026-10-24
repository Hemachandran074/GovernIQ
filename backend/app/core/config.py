"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
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
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"]
    )

    # Neo4j Settings
    NEO4J_URI: str = Field(default="bolt://localhost:7687")
    NEO4J_USER: str = Field(default="neo4j")
    NEO4J_PASSWORD: str = Field(default="password")
    NEO4J_READ_USER: str = Field(default="neo4j_ro")
    NEO4J_READ_PASSWORD: str = Field(default="ro_password")

    # LLM Settings
    LLM_PROVIDER: str = Field(default="groq")
    LLM_API_KEY: str = Field(default="")
    LLM_BASE_URL: str = Field(default="https://api.groq.com/openai/v1")
    LLM_MODEL: str = Field(default="llama-3.3-70b-versatile")


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
