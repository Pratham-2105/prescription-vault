from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105  -- OAuth2 token type, not a secret


class RefreshRequest(BaseModel):
    refresh_token: str
