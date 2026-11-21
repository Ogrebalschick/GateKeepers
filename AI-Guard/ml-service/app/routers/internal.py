from fastapi import APIRouter, HTTPException

from app.schemas import ReloadPolicyRequest
from app.utils.policy_loader import get_version, reload_policy

router = APIRouter(prefix="/internal")


@router.post("/reload-policy")
async def reload_policy_endpoint(request: ReloadPolicyRequest):
    try:
        version = reload_policy(request.content_yaml, request.version)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "loaded_version": version}


@router.get("/policy-version")
async def policy_version():
    return {"policy_version": get_version()}
