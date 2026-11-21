from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # === Application ===
    APP_NAME: str = "AstraGuard"
    VERSION: str = "1.0.0"

    # === Database ===
    DB_HOST: str = "database"
    DB_PORT: int = 3306
    DB_NAME: str = "mydb"
    DB_USER: str = "backend"
    DB_PASSWORD: str = ""
    MYSQL_ROOT_PASSWORD: str = ""

    # === JWT ===
    JWT_SECRET: str = ""
    JWT_EXPIRATION: int = 86400

    # === Passwords (demo users) ===
    ADMIN_PASSWORD: str = ""
    SRE_PASSWORD: str = ""
    DEV_PASSWORD: str = ""

    # === ML service ===
    ML_SERVICE_URL: str = "http://ml-service:8000"
    ML_TIMEOUT_SECONDS: float = 8.0

    # === Security Policy ===
    POLICY_FILE: str = "app/resources/security_policy.yaml"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    @property
    def DATABASE_URL(self) -> str:
        """Собирается на лету, чтобы корректно percent-encode пароль."""
        user = quote_plus(self.DB_USER)
        password = quote_plus(self.DB_PASSWORD)
        return (
            f"mysql+aiomysql://{user}:{password}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
