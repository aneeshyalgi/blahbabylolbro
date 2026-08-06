"""Local authentication — username/password with itsdangerous-signed session tokens."""
import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from passlib.context import CryptContext

import database as db

SESSION_COOKIE_NAME = "rwa_session"
SESSION_SECRET = os.environ.get("SESSION_SECRET", "change-me-in-production-please")
MAX_AGE_SECONDS = int(os.environ.get("SESSION_MAX_AGE", str(8 * 3600)))  # default 8 h

_signer = URLSafeTimedSerializer(SESSION_SECRET)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_token(username: str) -> str:
    return _signer.dumps({"sub": username})


def verify_token(token: str) -> str | None:
    """Return the username encoded in the token, or None if invalid/expired."""
    try:
        data = _signer.loads(token, max_age=MAX_AGE_SECONDS)
        return data.get("sub")
    except (BadSignature, SignatureExpired, KeyError):
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    user = db.get_user(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(body.username)
    return {"token": token, "username": body.username}


@router.post("/logout")
def logout():
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    """Validate the current session from the cookie or Bearer token."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.get_user(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"username": username}
