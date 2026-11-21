import copy
import yaml

from app.pipeline.layer0_rules import check_rbac
from app.utils.policy_loader import get_policy, get_version, load_policy, reload_policy


def test_policy_reload_changes_rbac_without_code_change():
    original = copy.deepcopy(load_policy())
    changed = copy.deepcopy(original)
    changed["agents"]["it_ops_agent"]["roles"]["developer"]["tools"]["read_logs"] = "any"
    version = reload_policy(yaml.safe_dump(changed, allow_unicode=True), 9)
    result = check_rbac("Show logs on billing-api-prod", {"target_agent": "it_ops_agent", "user_role": "developer"})
    assert version == 9
    assert get_version() == 9
    assert result is not None and result.decision == "allow"
    reload_policy(yaml.safe_dump(original, allow_unicode=True), int(original.get("version", 1)))


def test_invalid_policy_is_rejected():
    try:
        reload_policy("version: 2\nalways_block: []", 2)
    except ValueError:
        return
    raise AssertionError("Invalid policy should be rejected")
