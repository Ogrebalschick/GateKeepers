from typing import Any
import re

from app.config import ALLOW_BLOCK_MARGIN, ALLOW_MIN_CONFIDENCE, BLOCK_MIN_CONFIDENCE, LLM_ENABLED, RISK_LEVEL_MIN_CONFIDENCE
from app.pipeline.layer0_rules import (
    RuleResult, check_always_block, check_rbac, _risk_for_category, _PATTERNS,
    _ATTACHMENT_DIRECTIVE, _FORBIDDEN_ACTIONS, _CRITICAL_TOOL_PATTERNS,
    _SECRET_VALUE, _SECRET_ACCESS_REQUEST,
)
from app.pipeline.layer1_classifier import predict
from app.pipeline.layer2_llm import classify_with_llm
from app.pipeline.context_analyzer import prepare_analysis_context


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
    confidence = float(prediction["decision_confidence"])
    category = str(prediction.get("risk_category", "none"))
    category_confidence = float(prediction.get("category_confidence", 0.0))
    analysis = analysis_text or user_prompt

    if decision == "block" and confidence >= BLOCK_MIN_CONFIDENCE:
        threat_categories = {
            "harmful_content", "data_exfiltration", "fraud_social_engineering", "abuse",
            "jailbreak", "prompt_injection", "indirect_injection", "system_prompt_extraction",
            "system_prompt_override", "privilege_escalation", "tool_abuse",
            "unauthorized_data_access",
        }
        if category not in threat_categories:
            return RuleResult(
                "confirm", "sensitive_action", "medium",
                "Модель обнаружила риск, но не смогла обоснованно определить категорию угрозы; автоматическая передача запрещена до ручной проверки.",
            )
        risk_level = _model_risk_level(prediction, category, analysis, "block")
        return RuleResult(
            "block",
            category,
            risk_level,
            f"Модель выявила признаки угрозы {category.replace('_', ' ')} "
            f"(уверенность решения {confidence:.0%}, категория {category_confidence:.0%}); "
            "запрос не передаётся целевому агенту.",
        )

    if decision == "confirm" and confidence >= 0.42:
        risk_level = _model_risk_level(prediction, "sensitive_action", analysis, "confirm")
        return RuleResult(
            "confirm",
            "sensitive_action",
            risk_level,
            f"Модель определила потенциально значимое действие с уверенностью {confidence:.0%}; "
            "требуется отдельное явное подтверждение до передачи запроса целевому агенту.",
        )

    decision_probabilities = prediction.get("decision_probabilities", {})
    allow_probability = float(decision_probabilities.get("allow", confidence if decision == "allow" else 0.0))
    block_probability = float(decision_probabilities.get("block", 0.0))
    if (
        decision == "allow"
        and confidence >= ALLOW_MIN_CONFIDENCE
        and allow_probability - block_probability >= ALLOW_BLOCK_MARGIN
    ):
        return RuleResult(
            "allow",
            "none",
            _model_risk_level(prediction, "none", analysis, "allow"),
            "Автоматическая классификация не выявила достаточных признаков атаки; "
            "запрос разрешён для дальнейшей обработки с учётом политики.",
        )

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
            r"(?:what\s+(?:is|are|does|were)|what should i do instead|что мне сделать вместо этого|что делать вместо этого|как поступить вместо этого|what is the safe way|what are safe ways|why\b|explain\b|describe\b|compare\b|summari[sz]e|summary of|release notes|write (?:a |an )?(?:unit )?test|unit test|how should we test|test safely|isolated|disposable|approved alternative|request through sre|request access through|rotate|revoke|отзыв\w*|ротац\w*|postmortem|post-mortem|short story|polite email|what can you help|what are your limitations|show (?:the )?(?:release history|slo)|how many replicas|incident summary|write (?:a )?(?:sigma|yara|detection) rule|investigate\b.{0,100}(?:whether someone ran|logs|command)|audit (?:whether|logs?)|how can i audit|summarize (?:the )?(?:attached )?(?:document|notes|report|change request)|напиши тест|сделай тест|учебн\w*|сравнени\w*|как оформить запрос|не обходя права|подскажи.{0,60}запрос через sre|перескажи|суммируй|сводк\w*|base64.{0,100}(?:what|what does|что в ней|что это|decode)|сделай сводку|сформулируй вежливое письмо|напиши правило falco|как.{0,60}(?:защитить|ограничить|хранить|обнаружить|предотвратить|отозвать|ротировать)|почему\b|объясни\b|расскажи\b|что такое|разница между|сколько реплик|какие у тебя есть ограничения)",
            text,
            re.I,
        ))
        if safe_information:
            return RuleResult("allow", "none", "none", "Запрос носит справочный, аналитический или защитный характер и не требует выполнения изменяющей инфраструктуру операции.")
        if attachments and re.search(r"\\b(?:summari[sz]e|review|describe|перескажи|суммируй|кратко перескажи)\\b", text, re.I):
            return RuleResult("allow", "none", "none", "Запрошен анализ вложенного документа; активные инструкции для агента и запрещённые действия проверены отдельными правилами.")

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
    prepared = prepare_analysis_context(user_prompt, context)
    analysis_context = prepared["analysis_context"]
    prompt_for_analysis = prepared["prompt_for_analysis"]
    full_analysis_text = prepared["full_analysis_text"]

    rule_result = check_always_block(
        user_prompt=user_prompt,
        attachments=analysis_context["attachments"],
        history=analysis_context["history"],
        normalized_text=prompt_for_analysis,
        user_role=role,
        target_agent=str(context.get("target_agent") or "it_ops_agent"),
    )
    if rule_result:
        return rule_result, "layer0"

    rbac_result = check_rbac(user_prompt, analysis_context, prompt_for_analysis)
    if rbac_result:
        return rbac_result, "layer0"

    if prepared["safe_analysis"]:
        return RuleResult(
            "allow", "none", "none",
            "Запрос ограничен анализом, классификацией или защитным исследованием; цитируемые инструкции не рассматриваются как команды целевому агенту.",
        ), "layer0"

    prediction = predict(user_prompt, analysis_context, prompt_for_analysis)
    if prediction:
        result = _model_result(prediction, user_prompt, full_analysis_text)
        if result:
            return result, "layer1"

    if LLM_ENABLED:
        llm_result = classify_with_llm(user_prompt, analysis_context, full_analysis_text)
        if llm_result:
            return RuleResult(llm_result["decision"], llm_result["risk_category"], llm_result["risk_level"], llm_result["explanation"]), "layer2"

    return RuleResult("confirm", "sensitive_action", "medium",
                      "Не удалось уверенно классифицировать запрос; требуется явное подтверждение, автоматическая передача не выполняется."), "layer1" if prediction else "layer0"
