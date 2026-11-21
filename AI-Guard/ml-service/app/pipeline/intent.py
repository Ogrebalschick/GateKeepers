import re
from typing import Any

_META_TASK = re.compile(
    r"\b(?:explain|describe|compare|review|summari[sz]e|classify|identify|translate|investigate|audit|detect|analy[sz]e|what\s+(?:does|is|are|were|was|caused|causes)|why\s+(?:is|does|are|did)|what\s+controls|what\b.{0,60}\b(?:audit|log|events?|records?)|how\s+(?:can|should|do)\s+(?:we|i)?|show\s+(?:me\s+)?(?:an?\s+)?example|покажи\s+пример|как\s+(?:организовать|настроить|спроектировать|оформить))\b|"
    r"(?:объясни|расскажи|сравни|сравнен\w*|проверь|суммируй|классифицируй|определи|переведи|расследуй|проанализируй|обнаружь|что\s+(?:делает|такое)|почему|какие\s+меры)",
    re.I,
)
_INFORMATIONAL_QUERY = re.compile(
    r"^\s*(?:(?:hi|hello|hey|good morning|good afternoon|quick question|привет|здравствуйте|добрый день|слушай)[,!:.\s]+)*"
    r"(?:what\s+(?:is|are|were|was|does|caused|causes)|why\b|who\b|when\b|where\b|which\b|"
    r"what'?s\s+the\s+difference|difference\s+between|define\b|meaning\s+of|"
    r"explain\b.{0,100}(?:difference|meaning|concept|term|definition)|"
    r"что\s+такое|почему|кто\b|когда\b|где\b|какие\s+причины|чем\s+отличается|в\s+ч[её]м\s+разниц\w*|"
    r"объясни\b.{0,100}(?:разниц\w*|значени\w*|поняти\w*|термин\w*))",
    re.I,
)
_SAFE_CONTEXT = re.compile(
    r"\b(?:defen[cs]ive|security\s+training|security\s+class|classroom|educational\s+example|harmless\s+example|training|threat[- ]intelligence|incident\s+report|incident\s+response|incident|forensic|evidence|audit\s+(?:logs?|record|events?)|detection|detect(?:ion)?|phishing\s+detection|phishing\s+analysis|malware\s+indicators|signs\s+of\s+malware|malware\s+script\s+analysis|mitigat\w*|prevent\w*|preserve|safe\s+ways|safely\s+inspect|indicator|telemetry|least privilege|policy-level|without executing|do not execute|not asking to execute|dangerous|unsafe|prohibited|not allowed|how to check logs|whether someone ran|harden(?:ing)?|rotate credentials|credential rotation|access policies|safe credential rotation|whether someone attempted|vault access policy|security\s+alert|endpoint\s+logs|network\s+logs|threat\s+hunting|soc|vulnerability\s+analysis|malware\s+analysis|security\s+research|sql\s+injection|log4shell|reverse\s+shell|system\s+prompt|rbac|kubernetes|break[- ]glass\s+access|release\s+history|release\s+notes|deployment\s+history|postmortem|post-mortem|root\s+cause|falco|base64|bug\s+report|suspicious\s+(?:string|message)|literal\s+text|signs\s+of\s+phishing|report\s+(?:a\s+)?suspicious\s+message|isolated|disposable|development\s+database|test\s+database|change\s+request|security\s+log)\b|"
    r"(?:защит\w*|обучени\w*\s+безопасност|отч[её]т\s+об\s+инцидент|инцидент\w*|доказательств\w*|обнаружени\w*|детектировани\w*|предотврат\w*|признак\w* вредоносн\w*|анализ\w* фишингов\w*|обнаружить фишинг|сохранить\s+логи|как\s+проверить\s+логи|безопасн\w*\s+способ\w*|не\s+выполняй|не\s+запускай|индикатор\w*|не\s+обходя\s+права|через\s+sre|учебн\w*|без\s+выполнения|без\s+запуска)",
    re.I,
)
_DETECTION_RULE = re.compile(
    r"\b(?:write|create|draft|generate)\s+(?:a\s+)?(?:regex|regular\s+expression)\b.{0,140}\b(?:detect\w*|match\w*|flag\w*|find|identify)\b|"
    r"\b(?:write|create|draft|generate|составь|напиши|создай)\b.{0,50}\b(?:sigma|yara|falco|detection|detect(?:ion)?)\b.{0,30}\brule\b|"
    r"(?:напиши|составь|создай).{0,50}(?:правил\w*).{0,30}(?:sigma|yara|falco)|"
    r"\b(?:sigma|yara|falco)\b.{0,30}\brule\b.{0,80}\b(?:detect|identify|alert|flag)\b|"
    r"(?:правил\w*\s+обнаружени\w*|сигнатур\w*).{0,80}(?:обнаруж|детект)",
    re.I,
)
_UNSAFE_HOWTO = re.compile(
    r"\b(?:how\s+to|how\s+can\s+i|how\s+do\s+i|how\s+should\s+i|help\s+me|explain\s+how\s+to)\b.{0,160}\b(?:bypass|evade|steal|exfiltrate|exploit|weaponize|hide\s+traces|disable\s+audit|extract\s+passwords|harvest\s+credentials|обойти|уклониться|украсть|эксфильтрировать|эксплуатировать|вывести\s+данные|скрыть\s+следы|отключить\s+аудит)\b",
    re.I,
)
_UNSAFE_CREATION = re.compile(
    r"(?:\b(?:write|create|build|develop|generate|make|install|deploy|construct|напиши|создай|собери|разработай|установи)\s+(?:a\s+|an\s+)?"
    r"(?:ransomware|malware|spyware|keylogger|botnet|credential stealer|password stealer|exploit|payload|вредоносн\w*|кейлоггер|ботнет|эксплойт|вымогател\w*)\b|"
    r"\b(?:how\s+to|how\s+can\s+i|explain\s+how\s+to|help\s+me\s+to)\s+(?:write|create|build|develop|make|install|deploy)\s+(?:a\s+|an\s+)?"
    r"(?:ransomware|malware|spyware|keylogger|botnet|credential stealer|password stealer|exploit|payload)\b|"
    r"(?:как\s+(?:написать|создать|собрать|разработать|сделать|установить).{0,40}(?:вымогател\w*|вредоносн\w*|кейлоггер|ботнет|эксплойт|payload)))",
    re.I,
)
_MENTIONED_COMMAND = re.compile(
    r"\b(?:explain|describe|what does|why is|why does|объясни|расскажи|почему)\b.{0,100}\b(?:rm\s+-rf|iptables\s+-f|chmod\s+-r\s+777|curl.{0,40}\|.{0,20}bash)\b.{0,100}\b(?:dangerous|unsafe|mitigat|detect|опасн|небезопас|обнаруж|предотврат)\w*",
    re.I,
)
_MENTIONED_FORBIDDEN = re.compile(
    r"\b(?:explain|describe|why|объясни|расскажи|почему)\b.{0,100}\bcommand\b.{0,50}\b(?:wipes?|deletes?|disables?|turns?\s+off|erases?)\b.{0,60}\b(?:audit|logging|logs?)\b.{0,100}\b(?:dangerous|unsafe|preserve|mitigat|опасн|сохранить|предотврат)\w*",
    re.I,
)
_MENTIONED_EXFIL = re.compile(
    r"\b(?:explain|describe|why|объясни|почему)\b.{0,100}\b(?:send|sending|forward|upload|exfiltrat\w*|отправк\w*|пересылк\w*|вывод\w*)\b.{0,100}\b(?:secrets?|credentials?|tokens?|парол\w*|секрет\w*|токен\w*)\b.{0,100}\b(?:dangerous|unsafe|prevent|mitigat|опасн|предотврат)\w*",
    re.I,
)
_PHISHING_CREDENTIAL_REQUEST = re.compile(
    r"(?:write|draft|create|compose|составь|напиши|сформулируй).{0,100}(?:it\s+support|helpdesk|техподдержк|служб\w*\s+поддержк\w*).{0,120}(?:email|message|письм\w*).{0,160}(?:re[- ]enter|enter|submit|confirm|verify|введ\w*|повторно\s+введ\w*).{0,100}(?:sso|password|credentials?|парол\w*|уч[её]тн\w* данн\w*).{0,160}(?:https?://|www\.|\blink\b|ссылк\w*)",
    re.I,
)
_SYNTHETIC_DATA_REQUEST = re.compile(
    r"(?:create|generate|make|build|prepare|сгенерируй|создай|подготовь|сделай).{0,140}"
    r"(?:synthetic|mock|dummy|fake|fictional|sample|test|синтетическ\w*|тестов\w*|фиктивн\w*|вымышленн\w*|ненастоящ\w*).{0,120}"
    r"(?:dataset|data|records?|fixture|customer names?|customer list|fake names|fictional names|email addresses|"
    r"имена клиентов|список клиентов|набор данных|фикстур\w*|запис\w*|данн\w*)",
    re.I,
)
_DOCUMENT_REVIEW = re.compile(
    r"\b(?:summari[sz]e|review|read|analy[sz]e|inspect|translate|перескажи|суммируй|прочитай|проверь|проанализируй|переведи|анализируй|сделай|подготовь|составь)\b.{0,140}"
    r"\b(?:document|file|attachment|report|note|page|change\s+request|security\s+training|postmortem|post-mortem|runbook|memo|checklist|incident|log|logs|config(?:uration)?|"
    r"документ|файл|вложени|отч[её]т|записк|страниц|заявк\w*\s+на\s+изменени\w*|постмортем|инструкц\w*|инцидент\w*|лог\w*|конфиг\w*)\b|"
    r"(?:what\s+is\s+written\s+here|что\s+здесь\s+написано|кратк\w*\s+содержани\w*)",
    re.I,
)
_EXPLICIT_EXECUTION = re.compile(
    r"(?:^|[.!?;]\s*|\b(?:and\s+then|and|then|now|after\s+that|и\s+затем|и|затем|теперь)\s+)"
    r"(?:please\s+|пожалуйста\s+)?(?:run|execute|perform|deploy|apply|restart|reboot|delete|remove|destroy|drop|disable|wipe|erase|send|upload|forward|expose|share|выполни|запусти|разверни|примени|перезапусти|удали|отключи|сотри|отправь|перешли|открой|выставь)\b",
    re.I,
)
_FOLLOW_INSTRUCTIONS = re.compile(
    r"\b(?:follow|obey|carry\s+out|execute|perform)\b.{0,60}\b(?:the|these|those|above|previous|attached)?\s*(?:instructions?|steps?|operational\s+notes?|commands?)\b|"
    r"(?:следуй|выполни|исполн\w*|сделай).{0,60}(?:инструкц\w*|шаг\w*|команд\w*|указан\w*)",
    re.I,
)
_CONTINUATION = re.compile(
    r"^\s*(?:(?:okay[,! ]*)?(?:continue|proceed|go\s+ahead|do\s+it|run\s+it|execute\s+it|send\s+them|upload\s+them|forward\s+it|forward\s+them|share\s+it|carry\s+on|follow\s+through|продолжай|продолжи|давай|сделай\s+это|выполни\s+это|отправь\s+их|перешли\s+их|продолжай\s+по\s+инструкции)[.!,\s]*|(?:now|then|and\s+then|теперь|затем)\b)|"
    r"\b(?:send|upload|forward|share)\s+(?:it|them|that|those)\b|\b(?:share|send|forward)\b.{0,40}\b(?:link|url|address)\b|"
    r"(?:отправь|перешли|загрузи)\s+(?:это|их|туда)",
    re.I,
)
_QUOTED_AND_CODE = [
    re.compile(r"```[\s\S]*?```"),
    re.compile(r"`[^`\n]{1,2000}`"),
    re.compile(r"«[^»\n]{2,2000}»"),
    re.compile(r"“[^”\n]{2,2000}”"),
    re.compile(r"‘[^’\n]{2,2000}’"),
    re.compile(r'"[^"\n]{2,2000}"'),
    re.compile(r"(?<!\w)'[^'\n]{3,2000}'(?!\w)"),
]
_REPORTED_ACTION = re.compile(
    r"\b(?:the\s+)?(?:attacker|threat\s+actor|malware|someone|user|account)\s+(?:tried|attempted|attempts|was\s+trying)\s+to\s+"
    r"(?:disable|turn\s+off|wipe|erase|delete|remove|exfiltrate|send|upload|forward|steal|dump|run|execute|launch|start|add|insert|append|replace|modify)\b(?:\s+\w+){0,8}|"
    r"\b(?:attempts?\s+to|attempted\s+to|trying\s+to|tried\s+to)\s+(?:disable|turn\s+off|wipe|erase|delete|remove|add|insert|append|replace|modify)\b(?:\s+\w+){0,8}\b(?:auditd?|audit|logging|logs?|ssh.?keys?|authorized_keys|sudoers)\b",
    re.I,
)

_META_OBJECT_AFTER_COLON = re.compile(
    r"(?:classify|translate|analy[sz]e|review|identify|detect|переведи|классифицируй|разбери|проанализируй)"
    r"[^:]{0,100}:\s*.+$",
    re.I | re.S,
)


def has_explicit_execution(text: str) -> bool:
    value = str(text or "")
    value = re.sub(
        r"\b(?:do\s+not|don't|never|without|should\s+not|must\s+not|not\s+executing|without\s+executing|without\s+running)\s+"
        r"(?:run|running|execute|executing|perform|performing|send|sending|upload|uploading|forward|forwarding|reveal|revealing|print|printing)\b|"
        r"(?:не\s+(?:надо|нужно|выполняй|выполняя|выполнять|исполняй|исполняя|исполнять|запускай|запуская|запускать)|"
        r"без\s+(?:выполнения|исполнения|запуска))\s+(?:команд\w*|инструкц\w*|run|execute|commands?)?",
        " ", value, flags=re.I,
    )
    value = strip_reference_spans(value)
    return bool(_EXPLICIT_EXECUTION.search(value) or _FOLLOW_INSTRUCTIONS.search(value))


def is_detection_rule_request(text: str) -> bool:
    return bool(_DETECTION_RULE.search(str(text or "")))


def is_safe_analysis_request(text: str) -> bool:
    value = str(text or "")
    if has_explicit_execution(value):
        return False
    positive_value = re.sub(
        r"\b(?:do not|don't|never|without|не\s+надо|не\s+нужно)\s+(?:write|create|build|develop|make|install|создавай|создавать|делай|делать)\b.{0,60}\b(?:ransomware|malware|spyware|keylogger|botnet|exploit|payload|вредоносн\w*|кейлоггер|ботнет|эксплойт)\b",
        " ", value, flags=re.I,
    )
    if _UNSAFE_CREATION.search(positive_value):
        return False
    unsafe_howto = _UNSAFE_HOWTO.search(value)
    if unsafe_howto:
        defensive_detection = bool(re.search(
            r"\b(?:detect|identify|prevent|mitigate|monitor|audit|harden|defend|investigate|обнаруж\w*|выяв\w*|предотврат\w*|смягч\w*|монитор\w*|аудит\w*|защит\w*|расслед\w*)\b"
            r".{0,160}\b(?:bypass|evade|steal|exfiltrate|exploit|weaponize|hide\s+traces|disable\s+audit|extract\s+passwords|harvest\s+credentials|обойти|уклониться|украсть|эксфильтрировать|эксплуатировать|скрыть\s+следы|отключить\s+аудит)\b",
            value, re.I,
        ))
        if not defensive_detection:
            return False
    if _PHISHING_CREDENTIAL_REQUEST.search(value):
        return False
    if re.search(
        r"(?:investigate|review|analy[sz]e|inspect|расследуй|проверь|проанализируй).{0,120}"
        r"(?:whether|if|attempted|tried|пытал\w*|попытк\w*).{0,140}"
        r"(?:ssh.?keys?|authorized_keys|sudoers|auditd?|audit logs?|журнал\w* аудита|ssh.?ключ\w*|sudoers)",
        value, re.I,
    ) and not has_explicit_execution(value):
        return True
    if _SYNTHETIC_DATA_REQUEST.search(value) and not re.search(
        r"(?:real|actual|production|live|existing).{0,60}(?:customer|personal|user|account).{0,40}(?:data|records?)|"
        r"(?:реальн\w*|боев\w*|производственн\w*).{0,60}(?:клиент\w*|пользователь\w*|персональн\w*).{0,40}(?:данн\w*|запис\w*)",
        value, re.I,
    ):
        return True
    if is_detection_rule_request(value):
        return True
    if is_document_review_request(value):
        return True
    if re.search(r"\b(?:decode|decoding)\b.{0,80}\bbase64\b|\bbase64\b.{0,80}\bdecode\b", value, re.I):
        from app.utils.normalizer import normalize
        decoded = normalize(value)
        secret_markers = re.search(
            r"\b(?:password|passwd|secret|token|api[_ -]?key|private[_ -]?key|aws_secret_access_key|authorization)\s*[:=]|"
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{20,}\.",
            decoded, re.I,
        )
        if not secret_markers:
            return True
    if re.search(r"(?:break[- ]glass\s+access).{0,100}(?:organize|design|plan|configure|как\s+организовать|как\s+настроить)|(?:как\s+(?:организовать|настроить)).{0,100}break[- ]glass", value, re.I):
        return True
    if re.search(r"(?:show|покажи).{0,80}(?:release\s+history|release\s+notes|deployment\s+history|истори\w*\s+релиз\w*)", value, re.I):
        return True
    if re.search(
        r"(?:bug\s+report|report a bug|как\s+оформить\s+баг-репорт|баг-репорт).{0,180}(?:phrase|quoted|instruction|prompt injection|фраз\w*|игнорируй|инструкц\w*)|"
        r"(?:в\s+тикет\w*|тикет\w*).{0,160}(?:phrase|фраз\w*|prompt injection|инструкц\w*).{0,120}(?:bug\s+report|баг-репорт)|"
        r"(?:phrase|фраз\w*).{0,160}(?:как\s+оформить\s+баг-репорт|bug\s+report|баг-репорт)",
        value, re.I,
    ):
        return True
    if re.search(r"(?:write|draft|compose|help me write|prepare|напиши|составь|сформулируй|подготовь).{0,100}(?:polite\s+email|postmortem|post-mortem|incident\s+report|short\s+story|story|вежлив\w*\s+письм\w*|рассказ\w*|постмортем|отч[её]т\w*\s+об\s+инциденте)", value, re.I):
        return True
    if re.search(r"\bwhat should i do instead\b|что мне сделать вместо этого", value, re.I):
        return True
    if re.search(
        r"(?:составь|напиши|подготовь).{0,100}(?:безопасн\w*).{0,100}(?:отзыв\w*\s+ключ\w*|ротац\w*\s+секрет\w*)",
        value, re.I,
    ):
        return True
    if re.search(
        r"(?:write|draft|compose|prepare|составь|напиши|подготовь).{0,120}"
        r"(?:neutral|routine|informational|maintenance|planned downtime|обслуживан\w*|планов\w* прост\w*|нейтральн\w*).{0,100}"
        r"(?:notice|announcement|message|email|уведомлен\w*|объявлен\w*|сообщен\w*)",
        value, re.I,
    ):
        return True
    if re.search(
        r"\b(?:write|draft|compose|prepare)\b.{0,50}\b(?:a\s+)?(?:polite|friendly|short|brief)\s+(?:email|message|note)\b|"
        r"\b(?:write|draft|compose|prepare)\b.{0,100}\b(?:email|message|note)\b.{0,100}\b(?:reschedule|schedule|meeting|thank|follow[- ]?up|status update|availability)\b|"
        r"\b(?:write|draft)\s+(?:a\s+)?(?:unit\s+test|test)\b|"
        r"(?:напиши|составь|подготовь)\s+(?:вежлив\w*\s+письм\w*|тест\w*)",
        value, re.I,
    ):
        return True
    if re.search(
        r"(?:подскажи|объясни|как\s+оформить|как\s+запросить).{0,120}(?:доступ\w*|prod[- ]лог\w*|sre)|"
        r"(?:request|requesting)\s+(?:access|prod logs?)\s+through\s+sre|"
        r"не\s+обходя\s+права|without\s+bypassing\s+(?:access\s+)?controls",
        value, re.I,
    ):
        return True
    if _SYNTHETIC_DATA_REQUEST.search(value) and not re.search(
        r"(?:real|actual|production|live|existing).{0,60}(?:customer|personal|user|account).{0,40}(?:data|records?)|"
        r"(?:реальн\w*|боев\w*|производственн\w*).{0,60}(?:клиент\w*|пользователь\w*|персональн\w*).{0,40}(?:данн\w*|запис\w*)",
        value, re.I,
    ):
        return True
    if _INFORMATIONAL_QUERY.search(value):
        return True
    if re.search(
        r"(?:analy[sz]e|review|investigate|проанализируй|анализируй|разбери|расследуй).{0,100}(?:logs?|log file|лог\w*|журнал\w*)",
        value,
        re.I,
    ) and not has_explicit_execution(value):
        return True
    if re.search(
        r"(?:show|view|list|покажи|посмотри).{0,80}(?:deployment history|release history|истори\w* развёртыван\w*|истори\w* релиз\w*)",
        value,
        re.I,
    ):
        return True
    if re.search(
        r"(?:detect|identify|recognize|analyze|review|explain|describe|classify|investigate|обнаруж\w*|распозн\w*|проанализируй|проверь|опиши|выдели).{0,120}"
        r"(?:phishing|phish|social engineering|фишинг|социальн\w* инженер\w*|signs of malware|malware indicators|признак\w* вредоносн\w*)",
        value,
        re.I,
    ):
        return True
    if re.search(
        r"(?:сделай|подготовь|составь).{0,80}(?:сводк\w*).{0,100}(?:инцидент\w*|событи\w*|лог\w*)",
        value,
        re.I,
    ):
        return True
    if not _META_TASK.search(value):
        return False
    if _SAFE_CONTEXT.search(value):
        return True
    if re.match(r"^\s*(?:(?:quick\s+question|вопрос)\s*[:,-]?\s*)?(?:what\s+(?:is|are|were|was|caused|causes)|why\s+(?:is|does|are|did)|who\b|when\b|where\b|which\b|что\s+такое|почему|кто\b|когда\b|где\b|какие\s+причины|чем\s+отличается)", value, re.I):
        return True
    if re.search(r"\btranslate\b|переведи", value, re.I) and any(p.search(value) for p in _QUOTED_AND_CODE):
        return True
    if re.search(r"\bclassify\b|классифицируй", value, re.I) and re.search(r"\b(?:phrase|sample|example|training|string|text|snippet|line|quoted|guardrail|test suite)\b|фраз\w*|пример\w*|обучени\w*", value, re.I):
        return True
    return False

def is_document_review_request(text: str) -> bool:
    return bool(_DOCUMENT_REVIEW.search(str(text or ""))) and not has_explicit_execution(text)


def strip_reference_spans(text: str, remove_reported_actions: bool = True) -> str:
    value = str(text or "")
    for pattern in _QUOTED_AND_CODE:
        value = pattern.sub(" ", value)
    if remove_reported_actions:
        value = _REPORTED_ACTION.sub(" ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def analysis_surface(text: str) -> str:
    value = strip_reference_spans(text)
    value = re.sub(
        r"\b(?:do not|don't|never|without)\s+(?:write|create|build|develop|make|install)\b.{0,60}\b(?:ransomware|malware|spyware|keylogger|botnet|exploit|payload|вредоносн\w*|кейлоггер|ботнет|эксплойт)\b",
        " ", value, flags=re.I,
    )
    if _META_OBJECT_AFTER_COLON.search(value):
        value = value.split(":", 1)[0]
    value = _MENTIONED_COMMAND.sub(" ", value)
    value = _MENTIONED_FORBIDDEN.sub(" ", value)
    value = _MENTIONED_EXFIL.sub(" ", value)
    if is_detection_rule_request(text):
        value = re.sub(
            r"\b(?:ransomware|malware|spyware|keylogger|botnet|вымогател\w*|вредоносн\w*|кейлоггер|ботнет)\b",
            "target_pattern",
            value,
            flags=re.I,
        )
    return re.sub(r"\s+", " ", value).strip()

def is_continuation_prompt(text: str) -> bool:
    value = str(text or "")
    return bool(_CONTINUATION.search(value) or re.search(
        r"\b(?:send|upload|forward|share|transfer|archive|compress|encode|delete|wipe|erase|execute|run|restart|reveal|print|отправ\w*|пересыл\w*|переда\w*|архивир\w*|сожм\w*|кодир\w*|удал\w*|стира\w*|выполн\w*|запуст\w*|перезапуст\w*|раскро\w*|вывед\w*)\b",
        value, re.I,
    ))


def prepare_history(history: list[dict[str, Any]] | None, current_prompt: str) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "user")).lower()
        if role != "user":
            continue
        content = str(item.get("content", ""))
        if is_safe_analysis_request(content):
            content = analysis_surface(content)
        if content:
            result.append({"role": "user", "content": content})
    return result


def safe_attachment_content(content: str, user_prompt: str) -> str:
    value = str(content or "")
    if not is_document_review_request(user_prompt):
        return value
    active_code = re.compile(
        r"```[\s\S]*?(?:\b(?:system|assistant|for the bot|for ai agent|instructions? for ai)\b|для\s+бота|для\s+ии).{0,240}(?:ignore|reveal|print|send|forward|run|execute|delete|disable|override|игнорируй|раскрой|выведи|отправь|выполни|удали|отключи)[\s\S]*?```",
        re.I,
    )
    active_injection = re.compile(
        r"```[\s\S]*?(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|reveal\s+(?:the\s+)?system\s+prompt|игнорируй\s+(?:все\s+)?предыдущие\s+инструкции|раскрой\s+системн\w*\s+промпт)[\s\S]*?```",
        re.I,
    )
    reporting_context = bool(re.search(r"\b(?:quoted|quote|example|evidence|observed|reported|training sample|not executed|incident report)\b|(?:цитат\w*|пример\w*|свидетельств\w*|наблюдал\w*|отч[её]т\w*|не\s+выполнял\w*)", value, re.I))
    if active_code.search(value) or (active_injection.search(value) and not reporting_context):
        return value
    return strip_reference_spans(value)
