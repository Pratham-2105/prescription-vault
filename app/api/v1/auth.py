from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, DbSession
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.token import RefreshRequest, Token
from app.schemas.user import UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


async def _issue_token_pair(db: DbSession, user: User, user_agent: str | None) -> Token:
    """Create an access token plus a stored refresh token."""
    raw_refresh = generate_refresh_token()

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=refresh_token_expiry(),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    await db.commit()

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=raw_refresh,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def register(
    request: Request,
    response: Response,
    payload: UserCreate,
    db: DbSession,
) -> User:
    existing = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
) -> Token:
    user = await db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")

    return await _issue_token_pair(db, user, request.headers.get("user-agent"))


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest,
    db: DbSession,
) -> Token:
    invalid = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(payload.refresh_token)
        )
    )
    if stored is None:
        raise invalid

    expires_at = stored.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at <= datetime.now(UTC):
        await db.delete(stored)
        await db.commit()
        raise invalid

    user = await db.get(User, stored.user_id)
    if user is None or not user.is_active:
        await db.delete(stored)
        await db.commit()
        raise invalid

    # Rotation: the old token dies the moment it is used.
    await db.delete(stored)
    await db.commit()

    return await _issue_token_pair(db, user, request.headers.get("user-agent"))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: DbSession) -> None:
    await db.execute(
        delete(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(payload.refresh_token)
        )
    )
    await db.commit()


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: CurrentUser, db: DbSession) -> None:
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await db.commit()


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user
