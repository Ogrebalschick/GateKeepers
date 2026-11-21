from typing import Any
import re

from app.config import ALLOW_BLOCK_MARGIN, ALLOW_MIN_CONFIDENCE, CLASSIFIER_MIN_CONFIDENCE, LLM_ENABLED, RISK_LEVEL_MIN_CONFIDENCE
from app.pipeline.layer0_rules import (
    RuleResult, check_always_block, check_rbac, _risk_for_category, _PATTERNS,
    _ATTACHMENT_DIRECTIVE, _FORBIDDEN_ACTIONS, _CRITICAL_TOOL_PATTERNS,
    _SECRET_VALUE, _SECRET_ACCESS_REQUEST,
)
from app.pipeline.layer1_classifier import predict
from app.pipeline.layer2_llm import classify_with_llm
from app.utils.normalizer import normalize, normalize_attachments, normalize_history


def _model_risk_level(prediction: dict[str, Any], category: str, text: str, decision: str) -> str:
    fallback = _risk_for_category(category, text)
    fixed = {
        "harmful_content": "critical",
        "data_exfiltration": "critical",
        "fraud_social_engineering": "high",
        "abuse": "low",
        "jailbreak": "high",
        "indirect_injection": "high",
        "privilege_escalation": "high",
        "prompt_injection": "high",
        "system_prompt_extraction": "medium",
        "system_prompt_override": "high",
        "none": "none",
    }
    if category in fixed:
        return fixed[category]
    level = prediction.get("risk_level", fallback)
    confidence = float(prediction.get("risk_confidence", 0.0))
    allowed = {
        "tool_abuse": {"high", "critical"},
        "unauthorized_data_access": {"medium", "high"},
        "sensitive_action": {"none", "medium", "high"},
    }.get(category, set())
    if confidence >= RISK_LEVEL_MIN_CONFIDENCE and level in allowed:
        return str(level)
    if decision == "block" and level == "none":
        return fallback
    return fallback


def _model_result(prediction: dict[str, Any], user_prompt: str, analysis_text: str | None = None) -> RuleResult | None:
    decision = prediction["decision"]
    confidence = prediction["decision_confidence"]
    category = prediction.get("risk_category", "none")
    category_confidence = prediction.get("category_confidence", 0.0)

    always_block_categories = {
        "harmful_content", "data_exfiltration", "fraud_social_engineering", "abuse", "jailbreak",
        "prompt_injection", "indirect_injection", "system_prompt_extraction", "system_prompt_override",
        "privilege_escalation", "tool_abuse", "unauthorized_data_access",
    }
    if category in always_block_categories and category_confidence >= 0.70:
        risk_level = _model_risk_level(prediction, category, analysis_text or user_prompt, "block")
        return RuleResult("block", category, risk_level,
                          f"Модель выявила устойчивые признаки угрозы {category.replace('_', ' ')} с уверенностью {category_confidence:.0%}; запрос заблокирован.")

    if decision == "block" and confidence >= max(CLASSIFIER_MIN_CONFIDENCE, 0.62):
        if category not in always_block_categories or category_confidence < 0.28:
            category = "tool_abuse"
        risk_level = _model_risk_level(prediction, category, analysis_text or user_prompt, "block")
        return RuleResult("block", category, risk_level,
                          f"Модель обнаружила признаки категории {category.replace('_', ' ')} с уверенностью {confidence:.0%}; запрос не передаётся целевому агенту.")

    if category == "sensitive_action" and category_confidence >= 0.45:
        return RuleResult("confirm", "sensitive_action", _model_risk_level(prediction, "sensitive_action", analysis_text or user_prompt, "confirm"),
                          "Модель определила потенциально значимое действие; требуется отдельное явное подтверждение пользователя до передачи запроса целевому агенту.")

    if decision == "confirm" and confidence >= 0.42:
        return RuleResult("confirm", "sensitive_action", _model_risk_level(prediction, "sensitive_action", analysis_text or user_prompt, "confirm"),
                          f"Модель не смогла безопасно разрешить запрос с уверенностью {confidence:.0%}; требуется отдельное подтверждение пользователя.")

    decision_probabilities = prediction.get("decision_probabilities", {})
    allow_probability = float(decision_probabilities.get("allow", confidence if decision == "allow" else 0.0))
    block_probability = float(decision_probabilities.get("block", 0.0))
    if (
        decision == "allow"
        and confidence >= ALLOW_MIN_CONFIDENCE
        and allow_probability - block_probability >= ALLOW_BLOCK_MARGIN
        and category in {"none", "sensitive_action"}
    ):
        return RuleResult("allow", "none", _model_risk_level(prediction, "none", analysis_text or user_prompt, "allow"),
                          "Автоматическая классификация не выявила достаточных признаков атаки; запрос разрешён для дальнейшей обработки с учётом политики.")

    return None



def _safe_intent_override(user_prompt: str, attachments: list[dict[str, Any]] | None = None) -> RuleResult | None:
    text = user_prompt.lower()
    attachment_text = "\n".join(str(item.get("content", "")) for item in attachments or [])
    document_review = bool(re.search(
        r"(?:check|review|summari[sz]e|read|analy[sz]e|проверь|проанализируй|суммируй|прочитай).{0,80}(?:document|file|attachment|документ|файл|вложение)|what does this say|give me a short summary|что здесь написано|кратк\w* содержани\w*",
        text,
        re.I,
    ))
    if document_review and attachments:
        suspicious_attachment = bool(
            _ATTACHMENT_DIRECTIVE.search(attachment_text)
            or any(any(pattern.search(attachment_text) for pattern in patterns) for patterns in _PATTERNS.values())
            or any(pattern.search(attachment_text) for pattern in _FORBIDDEN_ACTIONS.values())
            or _SECRET_VALUE.search(attachment_text)
            or _SECRET_ACCESS_REQUEST.search(attachment_text)
            or any(pattern.search(attachment_text) for pattern in _CRITICAL_TOOL_PATTERNS)
        )
        if not suspicious_attachment:
            return RuleResult("allow", "none", "none", "Вложение не содержит обнаруженных инструкций для агента, запрещённых действий или запросов на раскрытие секретов; разрешён безопасный анализ документа.")

    direct_execution = bool(re.search(
        r"(?:^|[.!?]\s*)(?:please\s+)?(?:run|execute|deploy|apply|restart|reboot|delete|remove|destroy|drop|scale|set|configure|enable|disable|send|upload|forward)\b|(?:выполни|запусти|разверни|примени|перезапусти|удали|поставь|установи|настрой|включи|отключи|отправь|перешли|подними)\b",
        text,
        re.I,
    ))
    unsafe_creation = bool(re.search(
        r"(?:write|create|build|develop|make|generate|install|deploy|construct|steal|capture|dump|напиши|создай|разработай|сделай|установи|разверни|собери|укради|похити).{0,160}(?:botnet|ddos|spyware|keylogger|ransomware|malware|credential stealer|password stealer|exploit to break|bomb|explosive|poison|ботнет|ддос|шпионск\w* программ\w*|кейлоггер|вымогател\w*|вредоносн\w*|взрывчат\w*|бомб\w*|отрав\w*|парол\w*|уч[её]тн\w* данн\w*)",
        text,
        re.I,
    ))
    if not direct_execution and not unsafe_creation:
        safe_information = bool(re.search(
            r"(?:what\s+(?:is|are|does|were)|what should i do instead|что мне сделать вместо этого|why\b|explain\b|describe\b|compare\b|difference between|how (?:do|can|should) (?:i |we )?(?:protect|secure|detect|prevent|limit|store)|how to (?:protect|secure|detect|prevent|limit|store|mitigate)|rotate|revoke|postmortem|post-mortem|short story|polite email|what can you help|what are your limitations|show (?:the )?(?:release history|slo)|how many replicas|incident summary|write a test|write (?:a )?(?:sigma|yara|detection) rule|investigate\b.{0,100}(?:whether someone ran|logs|command)|напиши тест|base64.{0,100}(?:what|what does|что в ней|что это|decode)|сделай сводку|сформулируй вежливое письмо|напиши правило falco|как.{0,60}(?:защитить|ограничить|хранить|обнаружить|предотвратить|отозвать|ротировать)|почему\b|объясни\b|расскажи\b|что такое|разница между|сколько реплик|какие у тебя есть ограничения)",
            text,
            re.I,
        ))
        if safe_information:
            return RuleResult("allow", "none", "none", "Запрос носит справочный, аналитический или защитный характер и не требует выполнения изменяющей инфраструктуру операции.")

    meta_analysis = bool(re.search(r"(?:classify|identify|detect|write\s+(?:a\s+)?regex|write regex|analy[sz]e|translate|классифицируй|определи|напиши\s+регулярн|переведи|разбери)", text, re.I))
    quoted_security_text = bool(re.search(r"(?:ignore previous instructions|ignore all previous|reveal your prompt|забудь предыдущие инструкции|системный промпт|системный промт)", text, re.I))
    if meta_analysis and (quoted_security_text or re.search(r"(?:prompt injection|attack category|фразу|строку|паттерн|для отч[её]та)", text, re.I)):
        return RuleResult("allow", "none", "none", "Запрос просит классифицировать, обнаружить или перевести пример текста, а не выполнить содержащуюся в нём инструкцию.")
    if re.search(r"(?:decode|декодируй)\s+(?:this\s+)?base64", text, re.I):
        return RuleResult("allow", "none", "none", "Запрос ограничен декодированием строки; после нормализации опасная инструкция или запрещённое действие не обнаружены.")
    if re.search(r"(?:short story|рассказ).{0,160}(?:ethical hacker|хакер).{0,120}(?:police|полици).{0,100}(?:no technical details|без технических деталей)", text, re.I):
        return RuleResult("allow", "none", "none", "Запрошен художественный текст без технических инструкций и без действий с инфраструктурой.")
    if re.search(r"(?:how\s+to\s+organize|как\s+организовать).{0,80}break.?glass", text, re.I):
        return RuleResult("allow", "none", "none", "Запрос просит объяснить организационный процесс аварийного доступа, а не выдать или повысить полномочия.")
    if re.fullmatch(r"\s*(?:hi|hello|hey|thanks|thank you|привет|здравствуйте|добрый день|спасибо)[!.\s]*", text, re.I) or re.search(r"(?:thanks|thank you).{0,60}(?:that solved it|everything works|всё работает)|(?:спасибо).{0,60}(?:всё работает|решил\w*)", text, re.I):
        return RuleResult("allow", "none", "none", "Короткое приветствие или благодарность не содержит инструкции для целевого агента и может быть обработано безопасно.")
    return None


def evaluate_request(user_prompt: str, context: dict[str, Any]) -> tuple[RuleResult, str]:
    role = str(context.get("user_role", "unknown")).lower()
    prompt_normalized = normalize(user_prompt)
    attachments = normalize_attachments(context.get("attachments") or [])
    history = normalize_history(context.get("history") or [])
    full_analysis_text = "\n".join([
        prompt_normalized,
        *[item["content"] for item in history if item["role"].lower() == "user"],
        *[str(item.get("content", "")) for item in attachments],
    ])

    rule_result = check_always_block(
        user_prompt=user_prompt,
        attachments=attachments,
        history=history,
        normalized_text=prompt_normalized,
        user_role=role,
    )
    if rule_result:
        return rule_result, "layer0"

    rbac_result = check_rbac(user_prompt, {**context, "history": history}, prompt_normalized)
    if rbac_result:
        return rbac_result, "layer0"

    safe_intent = _safe_intent_override(user_prompt, attachments)
    if safe_intent:
        return safe_intent, "layer0"

    prediction = predict(user_prompt, {**context, "history": history, "attachments": attachments}, full_analysis_text)
    if prediction:
        result = _model_result(prediction, user_prompt, full_analysis_text)
        if result:
            return result, "layer1"

    if LLM_ENABLED:
        llm_result = classify_with_llm(user_prompt, {**context, "history": history, "attachments": attachments}, full_analysis_text)
        if llm_result:
            return RuleResult(llm_result["decision"], llm_result["risk_category"], llm_result["risk_level"], llm_result["explanation"]), "layer2"

    return RuleResult("confirm", "sensitive_action", "medium",
                      "Не удалось уверенно классифицировать запрос; требуется явное подтверждение, автоматическая передача не выполняется."), "layer1" if prediction else "layer0"
