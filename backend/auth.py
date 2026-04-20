import hashlib
import secrets
import os
from datetime import datetime, timedelta, timezone
import jwt

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "pm-secret-key-change-in-prod-2024")
ALGORITHM = "HS256"
EXPIRE_DAYS = 7


def hash_pin(pin: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 100_000)
    return dk.hex(), salt


def verify_pin(pin: str, pin_hash: str, salt: str) -> bool:
    check, _ = hash_pin(pin, salt)
    return secrets.compare_digest(check, pin_hash)


def create_token(user_id: int, knox_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "knox_id": knox_id, "exp": exp},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
