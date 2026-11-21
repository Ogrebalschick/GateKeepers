import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.pipeline.layer1_classifier import is_classifier_loaded, load_classifier, predict
from app.routers.check import router as check_router
from app.routers.internal import router as internal_router
from app.utils.policy_loader import get_version, load_policy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("astra_guard.startup")
model_warmed_up = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model_warmed_up
    load_policy()
    load_classifier()
    model_warmed_up = False
    if is_classifier_loaded():
        started = time.perf_counter()
        try:
            warmup_text = "Summarize the purpose of an access-control policy for a developer."
            warmup_result = predict(
                warmup_text,
                {"user_role": "developer", "history": [], "attachments": []},
                warmup_text,
            )
            model_warmed_up = isinstance(warmup_result, dict) and bool(warmup_result.get("decision"))
            elapsed_ms = (time.perf_counter() - started) * 1000
            if model_warmed_up:
                logger.info("Classifier warm-up completed in %.1f ms", elapsed_ms)
            else:
                logger.warning("Classifier warm-up returned no prediction")
        except Exception:
            logger.exception("Classifier warm-up failed")
    else:
        logger.warning("Classifier is not loaded; service starts without Layer 1")
    yield


app = FastAPI(title="Astra Guard ML Service", version="2.5.0", lifespan=lifespan)
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
        "model_warmed_up": model_warmed_up,
        "policy_version": get_version(),
    }


@app.get("/")
async def root():
    return {"service": "astra-guard-ml", "version": app.version, "docs": "/docs"}


app.include_router(check_router)
app.include_router(internal_router)
