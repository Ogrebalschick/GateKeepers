import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.pipeline.layer1_classifier import is_classifier_loaded, load_classifier
from app.routers.check import router as check_router
from app.routers.internal import router as internal_router
from app.utils.policy_loader import get_version, load_policy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_policy()
    load_classifier()
    yield


app = FastAPI(title="Astra Guard ML Service", version="2.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": str(exc)[:1000]})


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": app.version,
        "model_loaded": is_classifier_loaded(),
        "policy_version": get_version(),
    }


@app.get("/")
async def root():
    return {"service": "astra-guard-ml", "version": app.version, "docs": "/docs"}


app.include_router(check_router)
app.include_router(internal_router)
