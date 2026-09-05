from fastapi import APIRouter

from app.api.v1 import auth, medications, patients, prescriptions

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(patients.router)
api_router.include_router(prescriptions.router)
api_router.include_router(medications.router)
