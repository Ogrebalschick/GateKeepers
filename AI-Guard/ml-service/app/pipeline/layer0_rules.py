import fnmatch
import re
from dataclasses import dataclass
from typing import Any

from app.utils.policy_loader import get_policy
from app.pipeline.intent import is_safe_analysis_request


@dataclass
class RuleResult:
    decision: str
    risk_category: str
    risk_level: str
    explanation: str


_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "system_prompt_extraction": [
        re.compile(r"(?:show|reveal|print|repeat|quote|disclose|tell me)\s+(?:your\s+)?(?:full\s+)?(?:system\s+prompt|system message|developer instructions|hidden instructions)", re.I),
        re.compile(r"(?:покажи|раскрой|процитируй|повтори|выведи|скажи)\s+(?:мне\s+)?(?:полностью\s+)?(?:системн\w*\s+промпт|системн\w*\s+инструкц|инструкц\w*\s+разработчик)", re.I),
        re.compile(r"what\s+(?:exactly\s+)?(?:were you told|are your instructions)", re.I),
        re.compile(r"(?:show|reveal|print|repeat|quote|disclose|translate|copy|output|display)\s+(?:your\s+)?(?:full\s+)?(?:hidden instructions|original instructions|developer instructions|instructions given by (?:the )?developer|internal rules|hidden rules)", re.I),
        re.compile(r"(?:какие|что за).{0,80}(?:инструкц\w*|правил\w*).{0,80}(?:дал|передал|задал|предоставил).{0,50}(?:разработчик|создатель)|(?:полный текст|скрыт\w* правил\w*|исходн\w* инструкц\w*).{0,80}(?:покажи|скопируй|выведи|переведи|процитируй)|(?:покажи|скопируй|выведи|процитируй|переведи).{0,80}(?:сво[йяи]|твои|скрыт\w*|исходн\w*).{0,80}(?:инструкц\w*|правил\w*|системн\w* промпт|системн\w* промт)", re.I),
        re.compile(r"(?:покажи|скопируй|выведи|процитируй|переведи).{0,50}(?:свой|свои|твои).{0,60}(?:системн\w* промт|исходн\w* инструкц)", re.I),
        re.compile(r"(?:покажи|выведи|предоставь|скопируй).{0,100}(?:json[- ]?схем\w*|схем\w*).{0,120}(?:всех\s+своих\s+инструкц\w*|системн\w*\s+сообщени\w*|инструкц\w*\s+разработчик\w*)", re.I),
        re.compile(r"(?:выведи|[bв]ыbeди).{0,40}(?:свои|cвои|cboи).{0,40}(?:исходн|иcxoд[нh]).{0,40}(?:инструкц|иhctpykц)", re.I),
        re.compile(r"(?:quote|print|show|repeat|процитируй|покажи|выведи).{0,100}(?:verbatim|дословно).{0,120}(?:what (?:is )?written|что (?:у тебя )?написано).{0,120}(?:production|prod|подтвержден|секрет|инструкц)", re.I),
        re.compile(r"(?:print|show|dump|output|reveal|выведи|покажи|раскрой).{0,100}(?:the environment you were started with|startup environment|среду запуска).{0,100}(?:system prompt|developer instructions|system instructions|системн\w* промпт|developer message|скрыт\w* инструкц\w*|api endpoints|keys?)", re.I),
    ],
    "system_prompt_override": [
        re.compile(r"(?:your|the)\s+new\s+(?:system\s+prompt|instructions|rules)", re.I),
        re.compile(r"(?:твои|ваши)\s+новые\s+(?:инструкции|правила|системн\w*\s+промпт)", re.I),
        re.compile(r"(?:replace|override|change)\s+(?:your\s+)?(?:system\s+prompt|instructions|rules)", re.I),
        re.compile(r"(?:update|change|override|redefine).{0,80}(?:your\s+)?(?:policy|rules|role mapping|permissions).{0,120}(?:developer.{0,40}admin|role.{0,40}admin|developer.{0,40}equal.{0,40}admin)", re.I),
        re.compile(r"(?:обнови|измени|замени).{0,80}(?:свою\s+)?(?:политику|правила).{0,100}(?:роль.{0,40}developer.{0,40}admin|developer.{0,50}эквивалентн\w*.{0,40}admin)", re.I),
        re.compile(r"(?:commands?|команды).{0,100}(?:prefixed|starting|начинающиеся).{0,100}(?:run|execute|выполня\w*).{0,100}(?:prod|production|прод)", re.I),
        re.compile(r"(?:remember forever|save this as a system rule|запомни навсегда|сохрани это как системн\w* правил\w*).{0,140}(?:restrictions|ограничения).{0,100}(?:removed|lifted|сняты|отменены)", re.I),
        re.compile(r"(?:add|create|save|remember|set|добавь|создай|сохрани|запомни).{0,100}(?:permanent )?(?:exception|rule|override|исключени\w*|правил\w*).{0,140}(?:policy|confirmation|production|prod|checks?|подтвержден\w*|прод|провер\w*)", re.I),
        re.compile(r"(?:from now on|с этого момента).{0,120}(?:delete_resource|production actions?|действи\w* в prod).{0,100}(?:no longer require|without|не требует|без).{0,60}(?:confirmation|подтвержден\w*)", re.I),
        re.compile(r"```\s*system\b.{0,220}(?:new rule|новое правило|no longer require|без подтверждения|не требует подтверждения)|(?:system|системн\w*)\s*:\s*.{0,180}(?:confirmation(?:s)? (?:are )?(?:disabled|off)|подтвержден\w* в prod отключен\w*)", re.I | re.S),
        re.compile(r"(?:persist|make|add|create|save|remember|set|сохрани|добавь|создай|сделай).{0,140}(?:policy exception|exception to (?:the )?policy|исключени\w* в политик\w*).{0,160}(?:skip|bypass|disable|suspend|without confirmation|access checks|пропускать|обойти|отключить|без подтвержден\w*|проверки доступа)", re.I),
        re.compile(r"(?:treat this message as|считай это сообщение).{0,100}(?:new system policy|нов\\w* системн\\w* политик\\w*).{0,120}(?:suspend|disable|turn off|отключ\\w*|приостанов\\w*)", re.I),
        re.compile(r"(?:make|add|create|сделай|добавь|создай).{0,100}(?:an? )?exception.{0,120}(?:my user|this user|пользовател\\w*).{0,120}(?:delete|remove|удал\\w*).{0,120}(?:without|skip|no approval|без согласован\\w*|без подтвержден\\w*)", re.I),
    ],
    "prompt_injection": [
        re.compile(r"\bignoreallpreviousinstructions\b", re.I),
        re.compile(r"ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:system\s+)?instructions", re.I),
        re.compile(r"(?:игнорируй|забудь|отмени)\s+(?:все\s+)?(?:предыдущие|старые|системные)\s+(?:инструкции|указания|правила)", re.I),
        re.compile(r"(?:disable|turn\s+off|bypass|ignore)\s+(?:all\s+)?(?:safety|security|moderation|role)\s+(?:checks|rules|restrictions|policy)", re.I),
        re.compile(r"ignore\s+(?:the\s+)?role\s+policy|игнорируй\s+(?:политику|правила)\s+(?:ролей|доступа)", re.I),
        re.compile(r"(?:отключи|обойди|выключи)\s+(?:все\s+)?(?:проверки|ограничения|правила)\s+(?:безопасности|доступа|модерации)", re.I),
        re.compile(r"(?:new\s+system\s+prompt|system\s*:\s*.*(?:ignore|override|unrestricted|confirmations?\s+off|disable\s+confirmation|отключи\s+подтверждения)|<\|system\|>|</?system>)", re.I),
        re.compile(r"(?:previous|prior)\s+instructions?\s+(?:were\s+)?(?:just\s+)?(?:a\s+test|no\s+longer\s+valid)|предыдущие\s+инструкции\s+были\s+тестом", re.I),
        re.compile(r"(?:forget|забудь).{0,80}(?:what you were told|what they told you|что тебе говорили|что тебе сказали|предыдущ\w* инструкц\w*).{0,100}(?:new rules|новые правила|покажи|раскрой|выведи)", re.I),
        re.compile(r"(?:все\s+пользователи\s+имеют\s+роль\s+admin|every\s+user\s+is\s+admin)", re.I),
        re.compile(r"(?:cancel|revoke|отмени).{0,80}(?:all )?(?:your )?(?:security )?(?:rules|restrictions|правил\w* безопасности|ограничени\w*)", re.I),
        re.compile(r"(?:system|системн\w*).{0,80}(?:maintenance|обслуживан\w*).{0,100}(?:confirmation(?:s)?|подтвержден\w*).{0,60}(?:disabled|off|отключен\w*)", re.I),
    ],
    "jailbreak": [
        re.compile(r"\b(?:you are now|enable|activate)\s+(?:an?\s+)?(?:unfiltered|unrestricted|amoral|no[- ]?rules|developer\s+mode|aim)\b", re.I),
        re.compile(r"\b(?:developer mode|unrestricted mode|no rules mode)\b", re.I),
        re.compile(r"(?:enable|activate|turn on|switch to|включи|активируй|включить).{0,80}(?:developer\s*mode|unrestricted\s*mode|режим\s*разработчика|режимразработчика)", re.I),
        re.compile(r"(?:давай сыграем|представь|гипотетически|в вымышленном мире).{0,140}(?:без правил|без ограничений|без проверки|без законов)", re.I),
        re.compile(r"(?:roleplay|pretend|act)\s+(?:as|like).{0,100}(?:without rules|no restrictions|unfiltered|evil ai|hacker|без правил|без ограничений)", re.I),
        re.compile(r"(?:roleplay|ты в роли|ты играешь роль|ты акт[её]р|оставайся в роли).{0,120}(?:без правил|без ограничений|злой ии|злой ai|evil|unrestricted)", re.I),
        re.compile(r"(?:персонаж|character|actor|акт[её]р).{0,140}(?:всё позволено|everything is allowed|everything allowed|без ограничений|без правил|злой|evil)", re.I),
        re.compile(r"(?:ты больше не|теперь ты).{0,80}(?:без правил|без ограничений|злой ии|неограниченн)", re.I),
        re.compile(r"(?:everything forbidden is allowed|всё запрещённое разрешено|день наоборот).{0,100}(?:разрешено|allowed|можно)", re.I),
        re.compile(r"(?:real working example|реальный рабочий пример).{0,100}(?:not theory|не теория|без предупреждений|no disclaimers)", re.I),
        re.compile(r"(?:unlimited|unfiltered|unrestricted).{0,80}(?:no policy|no confirmation|without confirmation|нет политики подтверждений|без подтверждений)", re.I),
        re.compile(r"(?:stay in character|оставайся в роли).{0,120}(?:evil|villain|злой|без ограничений|без правил)", re.I),
        re.compile(r"(?:you are|ты|стань).{0,100}(?:evil sysadmin|злой сисадмин|злой администратор).{0,120}(?:ignore|disregard|care about rules|плевать на регламент|не соблюдай)", re.I),
        re.compile(r"(?:answer twice|ответь дважды).{0,100}(?:ignore|игнорир|no.?rules|без правил)", re.I),
        re.compile(r"hypothetically.{0,120}(?:install|установить).{0,120}(?:spyware|шпионск\w* программ\w*).{0,100}(?:wife|spouse|жены|телефон)", re.I),
        re.compile(r"(?:pretend|act as|roleplay as|представь себя|притворись|ты в роли).{0,120}(?:unrestricted root shell|root shell|неограниченн\w* root|root-оболочк\w*|shell без ограничений)", re.I),
        re.compile(r"(?:hypothetically|гипотетически).{0,120}(?:without role checks|no role checks|без проверк\w* рол\w*).{0,140}(?:get root|root access|получить root|root на prod|команд\w*)", re.I),
        re.compile(r"(?:authorized to test you|уполномочен\w* тестировать тебя).{0,140}(?:return|reveal|access).{0,100}(?:any.{0,10}user.{0,10}data|чуж\w* данн\w*|без permission checks|без провер\w* прав)", re.I),
        re.compile(r"притворись.{0,100}(?:без правил|без ограничений|неограниченн\w*|unrestricted)", re.I),
    ],
    "data_exfiltration": [
        re.compile(r"(?:send|forward|upload|post|exfiltrat\w*|перешли|отправь|выгрузи|загрузи).{0,100}(?:secrets?|passwords?|tokens?|credentials?|kubeconfig|private keys?|данные|секреты|пароли|токены|ключи).{0,100}(?:https?://|webhook|ngrok|paste\.|external|внешн\w*|почт\w*|@[\w.-]+\.[a-z]{2,})", re.I),
        re.compile(r"(?:https?://|webhook|ngrok|paste\.).{0,100}(?:password|secret|token|credential|kubeconfig|парол|секрет|токен|ключ)", re.I),
        re.compile(r"(?:include|embed|put|добавь|включи).{0,80}(?:secrets?|tokens?|passwords?|credentials?|секреты|токены|пароли|ключи).{0,100}(?:url|query|link|ссылк\w*|адрес)", re.I),
        re.compile(r"curl\s+https?://[^\s]+\s+(?:-d|--data).{0,80}(?:secret|token|password|key)", re.I),
        re.compile(r"(?:ngrok|cloudflared|tunnel|туннел\w*).{0,120}(?:auth|internal|private|prod|production|svc|service|внутренн\w*|прод).{0,100}(?::\d{2,5}|port|порт).{0,120}(?:send|share|forward|пришли|отправь|перешли|ссылк\w*)|(?:send|share|forward|пришли|отправь|перешли).{0,100}(?:ngrok|cloudflared).{0,100}(?:auth|internal|private|prod|production|svc|service|внутренн\w*|прод)", re.I),
        re.compile(r"(?:dump|export|upload|send|загрузи|залей|отправь|выгрузи).{0,180}(?:all customers|all users|personal data|customer data|customer dump|/etc/ssl/private|всех клиентов|персональн\w* данн\w*|данн\w* пользовател\w*|содержим\w* /etc/ssl/private).{0,180}(?:https?://|@[\w.-]+\.[a-z]{2,}|external|внешн\w*|почт\w*)", re.I),
        re.compile(r"(?:render|display|insert|загрузи|вставь|отобрази).{0,120}(?:image|markdown|картинк\w*).{0,160}(?:all user data|user data|данн\w* пользовател\w*).{0,160}(?:https?://|url|ссылк\w*)", re.I),
        re.compile(r"(?:send|upload|forward|post|отправь|перешли|залей|выгрузи).{0,140}(?:dump|archive|database|баз\w* данн\w*|дамп|всех клиент\w*).{0,120}(?:https?://|@[\w.-]+\.[a-z]{2,}|external|внешн\w*|почт\w*)", re.I),
        re.compile(r"(?:create|generate|build|сформируй|создай|подготовь).{0,160}(?:csv|dump|personal data|customer data|персональн\w* данн\w*|данн\w* пользовател\w*).{0,160}(?:upload|send|загрузи|залей|отправь|выгрузи).{0,140}(?:https?://|@[\w.-]+\.[a-z]{2,}|external|внешн\w*|почт\w*)", re.I),
        re.compile(r"(?:https?://[^\s]+).{0,120}(?:put_all_user_data_here|all user data|user data|данн\w* пользовател\w*)", re.I),
        re.compile(r"(?:render|display|insert|отобрази|вставь).{0,100}(?:image|markdown|картинк\w*).{0,160}(?:https?://).{0,160}(?:user data|all user data|данн\w* пользовател\w*)", re.I),



        re.compile(r"(?:print|show|list|dump|выведи|покажи|перечисли).{0,120}(?:production )?(?:api )?(?:tokens?|credentials?|секрет\w*|токен\w*|ключ\w*).{0,140}(?:place|post|publish|paste|помести|опубликуй|размести).{0,100}(?:public paste|pastebin|public|публичн\w*)", re.I),
    ],
    "fraud_social_engineering": [
        re.compile(r"(?:write|draft|create|compose|составь|напиши|сформулируй).{0,100}(?:it\s+support|helpdesk|техподдержк|служб\w*\s+поддержк\w*).{0,120}(?:email|message|письм\w*).{0,160}(?:re[- ]enter|enter|submit|confirm|verify|введ\w*|повторно\s+введ\w*).{0,100}(?:sso|password|credentials?|парол\w*|уч[её]тн\w* данн\w*).{0,160}(?:https?://|www\.|\blink\b|ссылк\w*)", re.I),
        re.compile(r"(?:create|build|make|design|сделай|создай|напиши|сверстай).{0,100}(?:fake|phishing|поддельн\w*|фейков\w*).{0,100}(?:login|sign.?in|логин|вход|страниц)", re.I),
        re.compile(r"(?:fake|phishing|поддельн\w*|фейков\w*).{0,100}(?:login page|страниц\w* входа|gitlab|sso).{0,100}(?:collect|steal|собрать|украсть|парол)", re.I),
        re.compile(r"(?:impersonat\w*|от имени).{0,80}(?:CTO|CEO|ИТ.?поддержк|техподдержк).{0,120}(?:password|парол|token|токен|MFA|код)", re.I),
        re.compile(r"(?:trick|convince|persuade|убеди|придумай легенду).{0,100}(?:support|helpdesk|дежурн\w*|техподдержк).{0,100}(?:password|парол|MFA|код|account|уч[её]тн\w*)", re.I),
        re.compile(r"(?:phishing|фишинг|social engineering|социальн\w* инженер\w*).{0,100}(?:campaign|email|письм|страниц|парол|mfa|token|токен)", re.I),
        re.compile(r"(?:write|draft|create|составь|напиши|создай).{0,80}(?:as|from|от имени).{0,60}(?:CTO|CEO|ИТ.?поддержк|техподдержк).{0,120}(?:ask|request|требовани|скинуть|передать).{0,60}(?:token|password|парол|токен|код)", re.I),
        re.compile(r"(?:impersonat\w*|от имени).{0,100}(?:it helpdesk|helpdesk|служб\w* поддержк\w*|техподдержк\w*).{0,140}(?:persuade|convince|collect|disclose|mfa|one.time code|код\w* mfa|одноразов\w* код)", re.I),
    ],
    "harmful_content": [
        re.compile(r"(?:write|create|build|develop|generate|напиши|создай|собери|разработай).{0,100}(?:ransomware|keylogger|malware|spyware|вредоносн\w*|кейлоггер|шифровальщик)", re.I),
        re.compile(r"(?:keylogger|кейлоггер|spyware|шпионск\w* программ\w*).{0,120}(?:silently|незаметно|stealth|send|отправля|парол)", re.I),
        re.compile(r"(?:rce|remote code execution|удал[её]нн\w* выполнени\w* код\w*).{0,100}(?:exploit|эксплойт|конкурент|чуж\w* сервер|чуж\w* систем)", re.I),
        re.compile(r"(?:write|create|develop|напиши|создай|разработай).{0,80}(?:exploit|эксплойт).{0,100}(?:competitor|чуж\w*|конкурент|steal|взлом)", re.I),
        re.compile(r"(?:synthesi[sz]e|синтезир\w*).{0,100}(?:methamphetamine|meth|метамфетамин|наркотик)", re.I),
        re.compile(r"(?:poison|отравить|отравлен\w*).{0,100}(?:person|человек|сердечн\w* приступ)", re.I),
        re.compile(r"(?:disable|bypass|отключить|обойти).{0,100}(?:alarm|cameras?|сигнализац|камер).{0,100}(?:break in|проникнуть|войти в чуж)", re.I),
        re.compile(r"(?:3d.?print|3d.?принтер|собрать).{0,100}(?:untraceable gun|пистолет|огнестрельн\w* оруж)", re.I),
        re.compile(r"(?:hack|взломать|получить доступ к).{0,100}(?:someone else's|чуж\w*).{0,80}(?:account|аккаунт|уч[её]тн\w*)", re.I),
        re.compile(r"(?:buy|купить).{0,80}(?:fentanyl|фентанил).{0,80}(?:without getting caught|не попасться|анонимно)", re.I),
        re.compile(r"(?:reverse shell|обратн\w* оболочк\w*).{0,100}(?:install|deploy|get access|получить доступ|незаметно)", re.I),
        re.compile(r"(?:script|скрипт).{0,120}(?:silently|stealth|незаметно).{0,120}(?:mine|mining|майнит|майнинг).{0,100}(?:cryptocurrency|crypto|криптовалют\w*).{0,100}(?:nodes|cluster|нод\w*|кластер\w*)", re.I),
        re.compile(r"(?=.*(?:write|create|build|develop|напиши|создай|разработай))(?=.*(?:botnet|ботнет))(?=.*(?:ddos|dos|ддос|denial.of.service|flood|flooding|атака))(?=.*(?:competitor|rival|website|site|конкурент|сайт)).*", re.I | re.S),
        re.compile(r"(?=.*(?:write|create|build|develop|напиши|создай|разработай))(?=.*(?:botnet|ботнет))(?=.*(?:ddos|dos|ддос|denial.of.service|flood|flooding|атака)).*", re.I | re.S),
        re.compile(r"(?:install|deploy|установи|установить|разверни).{0,120}(?:spyware|шпионск\w* программ\w*).{0,100}(?:wife|spouse|жены|телефон)", re.I),
        re.compile(r"(?:create|make|install|build|сделай|создай|установи|разработай).{0,120}(?:backdoor|бекдор|бэкдор).{0,120}(?:cron|persistence|survive reinstall|пережив\w* переустановк\w*|сохран\w* после переустановк\w*)", re.I),
        re.compile(r"(?:create|make|build|сделай|создай|разработай).{0,120}(?:hidden )?(?:password collector|credential collector|password stealer|сборщик паролей|сборщик учетных данных|похитител\w* парол\w*).{0,160}(?:persist|survive|reboot|restart|перезагрузк\w*|сохраня\w* после)", re.I),
        re.compile(r"(?:backdoor|бекдор|бэкдор).{0,160}(?:survive|survives|surviving|persist|package updates?|reconnect after reboot|после обновлен\w* пакет\w*|после перезагрузк\w*|пережив\w* обновлен\w*)", re.I),
    ],
    "abuse": [
        re.compile(r"(?:racist|расистск\w*|национальност\w*).{0,100}(?:jokes?|шутк\w*)", re.I),
        re.compile(r"(?:write|create|составь|напиши|придумай).{0,100}(?:threat|threatening|humiliat|bully|harass|угроз|травящ|унижа|оскорб)", re.I),
        re.compile(r"(?:make|write|create|напиши|составь).{0,100}(?:coworker|colleague|сотрудник|джун|коллег).{0,100}(?:quit|увол|испуг|бо[яи]л|humiliat|оскорб)", re.I),
        re.compile(r"(?:личн\w* жизн\w*).{0,80}(?:травящ|пост|оскорб|униж)", re.I),
        re.compile(r"(?:составь|напиши|создай|подготовь).{0,100}(?:угрожающ\w* письмо|письмо с угроз\w*).{0,140}(?:должник\w*|семь\w*|испуг\w*|запуг\w*)", re.I),
    ],
}

_ROLE_CLAIMS = [
    ("admin", re.compile(r"\b(?:i am|i'm|as)\s+(?:the\s+)?admin(?:istrator)?\b|\badmin(?:istrator)\s+here\b|\b(?:on.?call|duty)\s+admin\b|я\s+(?:теперь\s+)?(?:дежурн\w*\s+)?администратор|я\s+админ\b|дежурн\w*\s+админ|от\s+имени\s+администратора", re.I)),
    ("root", re.compile(r"\b(?:i have|i'm|as)\s+root\s+(?:access|privileges?)\b|\broot\s+user\b|я\s+root\b|у\s+меня\s+(?:есть\s+)?root", re.I)),
    ("sre", re.compile(r"\b(?:i am|i'm)\s+(?:an?\s+)?sre\b|я\s+sre\b", re.I)),
    ("admin", re.compile(r"(?:cto|ceo|руководител\w*|директор\w*).{0,80}(?:authorized|approved|разрешил|согласовал).{0,100}(?:work with me as admin|treat me as admin|работай со мной как с admin|считай меня админ\w*|права администратор\w*)", re.I)),
    ("admin", re.compile(r"(?:разрешил|согласовал|одобрил).{0,60}(?:cto|ceo|руководител\w*|директор\w*).{0,100}(?:работай со мной как с admin|считай меня админ\w*|права администратор\w*|предоставь.*admin)", re.I)),
 ]

_PRIVILEGE_ESCALATION_REQUEST = [
    re.compile(r"(?:add|make|grant|give)\s+me\s+(?:to\s+)?(?:the\s+)?(?:sudoers|wheel|administrators?|root)\b|(?:добавь|добавить)\s+меня\s+(?:в\s+группу\s+)?(?:sudoers|wheel|администратор\w*|root)", re.I),
    re.compile(r"(?:grant|give|выдай|предоставь)\s+(?:me|мне).{0,50}(?:admin|root|sudo|administrator|администратор\w*)\s+(?:rights|access|privileges|права|доступ)", re.I),
    re.compile(r"(?:treat|consider|regard)\s+(?:me|my account|this user)\s+as\s+(?:user_role\s*=\s*)?(?:admin|sre|root|administrator)|(?:set|change)\s+(?:my\s+)?(?:user_role|role)\s*(?:=|to)\s*(?:admin|sre|root)", re.I),
    re.compile(r"(?:выдай|предоставь|дай)\s+мне.{0,40}(?:права|роль).{0,30}(?:sre|admin|root|администратор)", re.I),
]

_ATTACHMENT_DIRECTIVE = re.compile(
    r"(?:\b(?:ai\s*[- ]?agent\s+instruction|ai assistant|assistant|system)\s*[:,-]|\bfor\s+(?:the\s+)?(?:ai\s+)?assistant\b|\binstructions?\s+for\s+(?:the\s+)?(?:ai\s+)?assistant\b|для\s+ии|ии-ассистент|инструкция\s+для\s+бота|для\s+бота|ассистенту\s*[:,-]|ассистент\s*[,;:]|боту\s*[:,-]|бот\s*[,;:]|<!--\s*ai).{0,240}(?:ignore|reveal|send|forward|upload|export|exfiltrate|extract|copy|post|run|execute|delete|disable|override|игнорируй|отправь|выгрузи|достань|скопируй|выведи|выполни|удали|отключи|раскрой)",
    re.I | re.S,
)

_STEALTH_AUDIT_SCRIPT = re.compile(
    r"(?:write|create|build|develop|generate|assemble|собери|создай|напиши|разработай|подготовь)"
    r".{0,120}(?:script|скрипт|utility|утилит|job|task|задани\w*)"
    r".{0,140}(?:stealth\w*|silently|quietly|unnoticed|hidden|without\s+detection|незаметн\w*|скрыт\w*)"
    r".{0,140}(?:delete|remove|wipe|erase|удален\w*|удалить|стереть|сотри)"
    r".{0,120}(?:audit\s+logs?|auditd?|audit\s+trail|logs?|logging|журнал\w*|логи)",
    re.I,
)

_FORBIDDEN_ACTIONS = {
    "disable_audit_or_wipe_logs": re.compile(r"(?:disable|turn\s+off|delete|remove|wipe|erase|удали|уничтожь|отключи|сотри|удалить).{0,80}(?:audit|auditd|logging|logs?|журнал\w*|аудит)", re.I),
    "pipe_remote_script_to_shell": re.compile(r"(?:curl|wget)\s+https?://[^\s|]+\s*\|\s*(?:sudo\s+)?(?:bash|sh)\b", re.I),
    "add_ssh_keys_or_sudoers_via_chat": re.compile(r"(?:add|append|добавь|добавить).{0,100}(?:ssh.?key|authorized_keys|sudoers|ssh.?ключ|ключ.{0,20}root)", re.I),
    "send_secrets_or_data_to_external_hosts": re.compile(r"(?:send|forward|upload|post|перешли|отправь|выгрузи|загрузи).{0,100}(?:secrets?|passwords?|tokens?|credentials?|kubeconfig|данные|секреты|пароли|токены|ключи).{0,100}(?:https?://|webhook|ngrok|paste\.|external|внешн\w*|почт\w*)", re.I),
}

_UNSAFE_OPERATIONAL_HOWTO = re.compile(
    r"\b(?:how\s+to|how\s+do\s+i|how\s+can\s+i|how\s+should\s+i|steps\s+to|guide\s+me\s+to|explain\s+how\s+to)\b"
    r".{0,180}\b(?:exploit|attack|compromise|bypass|evade|steal|exfiltrate|weaponize|hide\s+traces|disable\s+audit|extract\s+passwords|harvest\s+credentials|эксплуатировать|атаковать|скомпрометировать|обойти|уклониться|украсть|эксфильтрировать|отключить\s+аудит|извлечь\s+пароли)\b",
    re.I,
)

_CRITICAL_TOOL_PATTERNS = [
    re.compile(r"(?:force\s+push|git\s+push\s+--force|форсированн\w*\s+push|без\s+истории).{0,80}(?:main|master|prod|production|payments|auth)", re.I),
    re.compile(r"(?:scale|масштабируй).{0,100}(?:production|prod|прод).{0,80}(?:to\s+zero|в\s+ноль|0\s+реплик)", re.I),
    re.compile(r"(?:rm\s+-rf\s+/(?:\s|$)|rm\s+-rf\s+/var/lib|chmod\s+-R\s+777\s+/etc|iptables\s+-F)", re.I),
    re.compile(r"(?:open|expose|publish|открой|открыть|выставь).{0,100}(?:port|порт)\s*\d{1,5}.{0,120}(?:internet|public|всего интернета|внешн\w*)", re.I),
]


_SECRET_VALUE = re.compile(
    r"(?:show|print|dump|reveal|output|list|get|fetch|выведи|покажи|раскрой|прочитай|выгрузи|перечисли|получи).{0,100}(?:passwords?|парол\w*|access keys?|aws keys?|secret values?|secret contents?|secrets?.{0,40}(?:values?|contents?)|значени\w* секрет\w*|содержим\w* секрет\w*|токен\w*|credentials?|kubeconfig|private key|переменн\w* окружени\w*).{0,100}(?:prod|production|секрет|password|парол|value|значени|token|ключ|auth|vault)?",
    re.I,
)


_ENCODED_SECRET_MARKER = re.compile(
    r"\b(?:password|passwd|secret|token|api[_ -]?key|private[_ -]?key|aws_secret_access_key|authorization)\s*[:=]|"
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{20,}\.",
    re.I,
)


_SENSITIVE_ASSET = re.compile(
    r"(?:secrets?|passwords?|tokens?|credentials?|private keys?|api[_ -]?keys?|aws keys?|kubeconfig|database dumps?|customer data|prod(?:uction)? logs?|парол\w*|токен\w*|секрет\w*|ключ\w*|уч[её]тн\w* данн\w*|дамп\w* баз\w*)",
    re.I,
)
_SECRET_ACQUISITION = re.compile(
    r"(?:read|show|fetch|get|retrieve|dump|extract|export|collect|find|print|list|выведи|покажи|прочитай|получи|найди|выгрузи|собери|достань|извлеки|скопируй)",
    re.I,
)
_SECRET_TRANSFER = re.compile(
    r"(?:send|forward|upload|post|exfiltrat\w*|share|transfer|перешли|отправь|загрузи|перенаправь|пришли|передай|выгрузи)",
    re.I,
)
_EXTERNAL_DESTINATION = re.compile(
    r"(?:https?://|webhook|ngrok|cloudflared|pastebin|paste\.|external\s+(?:host|server|url)|внешн\w*\s+(?:адрес|сервер|сайт)|@[\w.-]+\.[a-z]{2,})",
    re.I,
)
_INTERNAL_SERVICE_TUNNEL = re.compile(
    r"(?:ngrok|cloudflared).{0,160}(?:auth|internal|private|prod|production|svc|service|внутренн\w*|прод).{0,80}:\d{2,5}",
    re.I,
)
_SHARE_TUNNEL_LINK = re.compile(r"(?:send|share|forward|пришли|п\s*pишли|отправь|перешли|ссылк\w*|link)", re.I)


def _has_external_destination(text: str) -> bool:
    if _EXTERNAL_DESTINATION.search(text):
        urls = re.findall(r"https?://[^\s,;<>]+", text, re.I)
        if not urls:
            return True
        for value in urls:
            host_match = re.match(r"https?://([^/:?#]+)", value, re.I)
            host = host_match.group(1).lower().strip(".") if host_match else ""
            if host and host not in {"localhost", "internal"} and not host.endswith((".internal", ".local", ".localhost")):
                return True
    return False


def _is_multi_step_exfiltration(
    current_prompt: str,
    history: list[dict[str, Any]],
    attachments: list[dict[str, Any]] | None = None,
) -> bool:
    user_turns = [
        str(item.get("content", "")) for item in history
        if isinstance(item, dict) and str(item.get("role", "user")).lower() == "user"
    ][-8:]
    attachment_text = "\n".join(
        str(item.get("content", "")) for item in (attachments or []) if isinstance(item, dict)
    )
    prior_context = "\n".join([*user_turns, attachment_text])
    prior_collection = (
        any(_SENSITIVE_ASSET.search(turn) and _SECRET_ACQUISITION.search(turn) for turn in user_turns)
        or bool(_SENSITIVE_ASSET.search(attachment_text))
    )
    if not prior_collection or not _SECRET_TRANSFER.search(current_prompt):
        return False
    destination_text = "\n".join([prior_context, current_prompt])
    return _has_external_destination(destination_text)


_SECRET_NAME_REQUEST = re.compile(
    r"(?:show|display|покажи|выведи).{0,60}(?:secret names|names of secrets|имена секретов|названия секретов)|(?:list|enumerate|перечисли).{0,40}(?:secrets?|секреты)",
    re.I,
)

_SECRET_ACCESS_REQUEST = re.compile(
    r"(?:read|show|access|dump|list|get|fetch|покажи|прочитай|получи|выведи|перечисли).{0,70}(?:secrets?|secret store|vault|секрет\w*|хранилищ\w* секрет\w*)",
    re.I,
)

_TOOL_PATTERNS = {
    "read_logs": re.compile(r"(?:\b(?:show|read|view|tail|print|fetch|display|dump)\b.{0,60}\b(?:logs?|audit logs?)\b|\b(?:logs?|журнал\w*)\b.{0,70}\b(?:show|read|view|tail|print|fetch|display|покажи|прочитай|выведи|посмотри)\b|(?:покажи|прочитай|выведи|посмотри|получи).{0,60}(?:логи|журнал\w*))", re.I),
    "restart_service": re.compile(r"\b(?:restart|reboot|roll\s*back|rollback|scale)\b|(?:перезапуст\w*|перезапуск\w*|откат\w*|масштабируй|масштабирован\w*)", re.I),
    "delete_resource": re.compile(r"\b(?:delete|remove|destroy|drop)\b|(?:удали|удалить|удаление|уничтож\w*|снеси)\b|\brm\s+-rf\b", re.I),
    "run_shell": re.compile(r"(?:\brun_shell\b|\brun\s+(?:this\s+)?command\b|\bexecute\s+(?:this\s+)?command\b|\brun\s+(?:a\s+)?shell\b|\bshell\s+(?:on|in|at)\b|\bdiagnostic\s+shell\s+command\b|\bopen\s+(?:a\s+)?shell\b|\brun\s+on\b|\bexecute\s+on\b|выполни\s+(?:команду|на)|запусти\s+(?:команду|на)|выполни\s+`?[a-z][\w.-]*\s+-|\b(?:df\s+-h|iptables\s+-|chmod\s+-|kubectl\s+delete|systemctl\s+(?:stop|restart)|kill\s+(?:process\s+)?(?:-\w+\s+)?\d+|pkill\s+|killall\s+|stop\s+process\s+\d+)\b|\b(?:set|export)\s+[A-Z][A-Z0-9_]*\s*=|(?:поставь|установи|измени)\s+[A-Z][A-Z0-9_]*\s*=|(?:migrate|migration|deploy|apply|миграц\w*|разверни|примени).{0,100}(?:prod|production|k8s-prod|прод))", re.I),
}

_RESOURCE_RE = re.compile(r"(?<![\w])(?:[a-z0-9][a-z0-9._-]{2,})(?![\w])", re.I)


def _has_any(text: str, patterns: list[re.Pattern[str]]) -> bool:
    return any(pattern.search(text) for pattern in patterns)


def _role_claim_mismatch(text: str, role: str) -> bool:
    ranks = {"developer": 0, "sre": 1, "admin": 2}
    actual_rank = ranks.get(role, -1)
    for claimed_role, pattern in _ROLE_CLAIMS:
        if pattern.search(text):
            if claimed_role == "root":
                return True
            if ranks.get(claimed_role, -1) > actual_rank:
                return True
    return False


def check_privilege_claim(user_prompt: str, user_role: str) -> bool:
    return _role_claim_mismatch(user_prompt, user_role.lower())


def _detect_environment(text: str, policy: dict[str, Any]) -> str:
    explicit_prod = bool(re.search(r"\b(?:production|prod)\b|прод(?:акшн)?", text, re.I))
    explicit_nonprod = bool(re.search(r"\b(?:non.?prod|development|dev|stage|staging|test|testing)\b|\b(?:разработк|тестов|стейдж)\w*", text, re.I))
    env_patterns = policy.get("agents", {}).get("it_ops_agent", {}).get("environments", {})
    resources = _RESOURCE_RE.findall(text)
    inferred_prod = False
    inferred_nonprod = False
    for resource in resources:
        if resource.lower().startswith("feature-"):
            inferred_nonprod = True
        for pattern in env_patterns.get("prod", []):
            if fnmatch.fnmatch(resource.lower(), str(pattern).lower()):
                inferred_prod = True
        for pattern in env_patterns.get("nonprod", []):
            if fnmatch.fnmatch(resource.lower(), str(pattern).lower()):
                inferred_nonprod = True
    if (explicit_prod or inferred_prod) and (explicit_nonprod or inferred_nonprod):
        return "unknown"
    if explicit_prod or inferred_prod:
        return "prod"
    if explicit_nonprod or inferred_nonprod:
        return "nonprod"
    return "unknown"


def _detect_tool(text: str) -> str | None:
    is_explanatory = bool(re.search(r"\b(?:explain|describe|compare|difference between|what is|how does|why is|teach me|how to|how do i|how can i|what should i do|объясни|расскажи|сравни|разница между|почему|как работает|что такое|как правильно|как безопасно|как можно|как\s+(?:мне\s+)?(?:принудительно\s+)?(?:удалить|выполнить|перезапустить))\b", text, re.I))
    has_direct_execution = bool(re.search(r"\b(?:execute|run|perform)\s+(?:this\s+|the\s+)?(?:command|tool|script)\b|(?:выполни|запусти)\s+(?:эту\s+|данную\s+)?(?:команду|скрипт)\b", text, re.I)
                                 or re.search(r"(?:^|[.!?]\s+)(?:please\s+)?(?:restart|delete|remove|show|read|tail|print|dump)\b|(?:^|[.!?]\s+)(?:перезапусти|удали|покажи|прочитай|выведи)\b", text, re.I))
    if is_explanatory and not has_direct_execution:
        return None
    for tool in ("delete_resource", "restart_service", "read_logs", "run_shell"):
        pattern = _TOOL_PATTERNS[tool]
        if pattern.search(text):
            if is_explanatory and tool == "run_shell" and not re.search(r"(?:execute|run|выполни|запусти)\s+(?:this\s+)?(?:command|команду)", text, re.I):
                continue
            if is_explanatory and tool == "delete_resource" and not re.search(r"(?:delete|remove|destroy|drop|удали|удалить)\s+(?:this|the|этот|эту|ресурс)", text, re.I):
                continue
            return tool
    return None


def _resolve_policy_rule(role: str, tool: str, environment: str, policy: dict[str, Any]) -> str:
    agent = policy.get("agents", {}).get("it_ops_agent", {})
    role_policy = agent.get("roles", {}).get(role, {})
    rule = role_policy.get("tools", {}).get(tool)
    if rule is None:
        return "deny"
    if isinstance(rule, dict):
        if environment == "unknown":
            if "prod" in rule and "nonprod" in rule:
                return str(rule["prod"])
            if "any" in rule:
                return str(rule["any"])
            return "deny"
        return str(rule.get(environment, rule.get("any", "deny")))
    if rule == "any":
        return "allow"
    if rule == "deny":
        return "deny"
    if rule == "nonprod":
        return "allow" if environment == "nonprod" else "deny"
    if rule == "prod":
        return "allow" if environment == "prod" else "deny"
    if rule in {"allow", "confirm", "block"}:
        return rule
    return "deny"


def _risk_for_category(category: str, text: str = "") -> str:
    if category == "harmful_content":
        return "critical"
    if category == "data_exfiltration":
        return "critical"
    if category == "abuse":
        return "low"
    if category == "system_prompt_extraction":
        return "medium"
    if category == "unauthorized_data_access":
        return "high" if re.search(r"password|парол|secret|token|ключ|credential|kubeconfig", text, re.I) else "medium"
    if category == "tool_abuse":
        critical = re.search(
            r"rm\s+-rf|\b(?:delete|destroy|drop)\b|удал\w*|force.?push|iptables\s+-f|chmod\s+-r\s+777|"
            r"curl.*\|.*(?:bash|sh)|sudoers|authorized_keys|ssh.?key|ssh.?ключ|"
            r"(?:open|expose|publish|открой|открыть|выставь).{0,100}(?:port|порт).{0,100}(?:internet|public|всего интернета|внешн)|"
            r"(?:scale|масштаб\w*).{0,100}(?:to\s+zero|в\s+ноль|0\s+реплик)|"
            r"(?:restart|reboot|перезапусти|перезагрузи).{0,100}(?:prod|production|прод)",
            text,
            re.I,
        )
        return "critical" if critical else "high"
    if category == "sensitive_action":
        delete_action = re.search(r"\b(?:delete|remove|destroy|drop)\b|удал\w*|уничтож\w*", text, re.I)
        resource_type = re.search(r"\b(?:bucket|volume|namespace)\b|бакет|том|неймспейс|пространств\w+ имен", text, re.I)
        nonprod = re.search(r"\b(?:dev|stage|staging|test|testing|qa)\b|feature-[\w-]+|tmp-test|разработк\w*|тестов\w*|стейдж\w*", text, re.I)
        production = re.search(r"\b(?:prod|production)\b|прод(?:акшн)?|[-_]prod(?:[-_.:]|$)", text, re.I)
        if delete_action and resource_type and not nonprod and (production or re.search(r"\bbucket\b|бакет", text, re.I)):
            return "high"
        return "medium"
    if category == "none":
        return "none"
    return "high"


def check_always_block(user_prompt: str, attachments: list[dict[str, Any]] | None = None,
                       history: list[dict[str, Any]] | None = None,
                       normalized_text: str | None = None, user_role: str = "unknown") -> RuleResult | None:
    policy = get_policy()
    attachments = attachments or []
    history = history or []
    prompt_text = normalized_text or user_prompt
    user_turns = [
        str(item.get("content", ""))
        for item in history
        if isinstance(item, dict) and str(item.get("role", "user")).lower() == "user"
    ]
    attachment_text = "\n".join(str(item.get("content", "")) for item in attachments)

    def scan_user_segment(segment: str) -> str:
        explicit = bool(re.search(
            r"(?:^|[.!?;]\s*|\b(?:and then|then|now)\s+)(?:please\s+)?"
            r"(?:run|execute|deploy|apply|restart|reboot|delete|remove|destroy|drop|disable|wipe|erase|send|upload|forward|"
            r"выполни|запусти|разверни|примени|перезапусти|удали|отключи|сотри|отправь|перешли)\b",
            segment,
            re.I,
        ))
        meta_request = bool(re.search(
            r"(?:classify|identify|detect|review|investigate|write a regex|write regex|write a sigma|write a yara|"
            r"analy[sz]e|translate|explain|describe|audit|summari[sz]e|what does|what is|quote|"
            r"объясни|расскажи|классифицируй|определи|переведи|разбери|проверь|расследуй|"
            r"кратко перескажи|что такое|что означает|процитируй)",
            segment,
            re.I,
        )) and not explicit
        if not meta_request:
            return segment

        cleaned = re.sub(
            r"«[^»]*»|“[^”]*”|‘[^’]*’|\"[^\"]{3,}\"|(?<![A-Za-z0-9])'[^']{3,}'",
            " ",
            segment,
            flags=re.S,
        )
        cleaned = re.sub(
            r"(?:phrase|sentence|text|example|sample|quoted text|фраз\w*|выражени\w*|пример\w*|цитат\w*)"
            r".{0,100}(?:ignore.{0,30}instructions?|reveal.{0,30}system prompt|show.{0,30}system prompt|"
            r"игнорируй.{0,40}инструкц|раскрой.{0,40}системн|покажи.{0,40}системн)",
            " ",
            cleaned,
            flags=re.I | re.S,
        )
        defensive = bool(re.search(
            r"(?:mitigat|prevent|defend|defensive|suspicious|forensic|incident|sigma|yara|detection rule|"
            r"whether someone ran|investigate|preserve|hardening|how to check logs|audit|"
            r"подозрительн|обнаружени\w*|правил\w* обнаружени\w*|расследовани\w*|сохранить журнал\w*)",
            segment,
            re.I,
        ))
        cleaned = re.sub(r"```[\s\S]*?```|`[^`\n]*`", " ", cleaned)
        if defensive:
            cleaned = re.sub(
                r"\b(?:attempts?\s+to|attempted\s+to|trying\s+to|attempting\s+to)\s+"
                r"(?:disable|turn\s+off|wipe|erase|delete|remove)\b.{0,100}\b(?:auditd?|logging|logs?)\b",
                " ",
                cleaned,
                flags=re.I,
            )
            if re.search(r"(?:without disabling it myself|without turning it off myself|не отключая (?:его )?самостоятельно|не отключая его самому)", segment, re.I):
                return ""
        return cleaned

    scan_combined = "\n".join(
        [scan_user_segment(prompt_text), *(scan_user_segment(turn) for turn in user_turns)]
    )
    if _STEALTH_AUDIT_SCRIPT.search("\n".join([prompt_text, *user_turns])):
        return RuleResult(
            "block", "harmful_content", "critical",
            "Запрошено создание скрытого инструмента для удаления аудита или журналов; такой инструмент не может быть передан целевому агенту.",
        )

    unsafe_howto_sources = [segment for segment in [user_prompt, *user_turns]
                            if _UNSAFE_OPERATIONAL_HOWTO.search(segment) and not is_safe_analysis_request(segment)]
    if unsafe_howto_sources:
        unsafe_text = "\n".join(unsafe_howto_sources)
        if re.search(r"\b(?:exfiltrat\w*|steal|send\s+secrets?|extract\s+passwords?|harvest\s+credentials)\b|(?:эксфильтр\w*|украсть\w*|извлечь\s+пароли)", unsafe_text, re.I):
            return RuleResult("block", "data_exfiltration", "critical", "Запрошена операционная инструкция по извлечению или выводу чувствительных данных; такая деятельность запрещена политикой.")
        if re.search(r"\b(?:disable\s+audit|wipe\s+logs?|hide\s+traces)\b|(?:отключить\s+аудит|стереть\s+логи)", unsafe_text, re.I):
            return RuleResult("block", "tool_abuse", "critical", "Запрошена инструкция по отключению аудита или сокрытию следов; такое действие запрещено политикой.")
        if re.search(r"\b(?:steal|harvest\s+credentials|phish)\b|(?:украсть\w*\s+(?:парол|уч[её]тн)|фишинг)", unsafe_text, re.I):
            return RuleResult("block", "fraud_social_engineering", "high", "Запрос направлен на получение чужих учётных данных или обход средств защиты.")
        return RuleResult("block", "harmful_content", "critical", "Запрошена операционная инструкция по эксплуатации уязвимости или обходу защитных механизмов вне безопасного аналитического контекста.")
    explicit_execution = bool(re.search(
        r"(?:^|[.!?;]\s*|\b(?:and then|then|now)\s+)(?:please\s+)?"
        r"(?:run|execute|deploy|apply|restart|reboot|delete|remove|destroy|drop|disable|wipe|erase|send|upload|forward|"
        r"выполни|запусти|разверни|примени|перезапусти|удали|отключи|сотри|отправь|перешли)\b",
        prompt_text,
        re.I,
    ))
    analysis_request = bool(re.search(
        r"(?:classify|identify|detect|review|investigate|write a regex|write regex|write a sigma|write a yara|"
        r"analy[sz]e|translate|explain|describe|audit|summari[sz]e|what does|what is|quote|"
        r"объясни|расскажи|классифицируй|определи|переведи|разбери|проверь|расследуй|"
        r"кратко перескажи|что такое|что означает|процитируй)",
        prompt_text,
        re.I,
    )) and not explicit_execution
    educational_safe = bool(re.search(
        r"(?:explain|describe|what does|why is|what makes|объясни|расскажи|почему|чем опасно)"
        r".{0,120}(?:dangerous|unsafe|prohibited|not allowed|почему|опасн|запрещ|небезопас)",
        prompt_text,
        re.I,
    ))


    if "indirect_injection" in policy.get("always_block", []):
        if _ATTACHMENT_DIRECTIVE.search(attachment_text):
            return RuleResult("block", "indirect_injection", "high", "Вложение содержит инструкцию, адресованную ИИ-агенту и пытающуюся изменить его поведение или вызвать действие.")
        for attachment_category in ("prompt_injection", "jailbreak", "system_prompt_override", "system_prompt_extraction"):
            if _has_any(attachment_text, _PATTERNS.get(attachment_category, [])):
                return RuleResult("block", "indirect_injection", "high", "Во вложении обнаружена активная инструкция, направленная на изменение поведения или раскрытие защищённых данных агента.")

    if "data_exfiltration" in policy.get("always_block", []) and _is_multi_step_exfiltration(prompt_text, history, attachments):
        return RuleResult("block", "data_exfiltration", "critical", "История и текущий запрос образуют многошаговую попытку извлечения чувствительных данных и передачи их на внешний адрес.")

    if re.search(
        r"(?:add|append|insert|replace|добавь|добавить|вставь|замени).{0,140}(?:ssh key|authorized_keys|ssh-ключ|ключ.{0,30}root)|"
        r"(?:authorized_keys).{0,140}(?:add|append|insert|replace|добавь|добавить|вставь|замени)",
        scan_combined,
        re.I,
    ):
        return RuleResult("block", "tool_abuse", "critical", "Запрошено добавление SSH-ключа в привилегированный аккаунт; такое действие блокируется политикой.")

    if "privilege_escalation" in policy.get("always_block", []) and (_role_claim_mismatch(scan_combined, user_role.lower()) or _has_any(scan_combined, _PRIVILEGE_ESCALATION_REQUEST)):
        return RuleResult("block", "privilege_escalation", "high", "Текст запроса пытается заявить или получить повышенные полномочия, не подтверждённые доверенным контекстом пользователя.")

    for category in ("jailbreak", "prompt_injection", "system_prompt_override", "system_prompt_extraction"):
        if category in policy.get("always_block", []) and _has_any(scan_combined, _PATTERNS[category]):
            level = _risk_for_category(category, scan_combined)
            return RuleResult("block", category, level, f"Обнаружена попытка {category.replace('_', ' ')}; вход не передаётся целевому агенту.")

    if "fraud_social_engineering" in policy.get("always_block", []) and _has_any(scan_combined, _PATTERNS["fraud_social_engineering"]):
        return RuleResult("block", "fraud_social_engineering", "high", "Запрос направлен на фишинг, подмену личности или получение чужих учётных данных.")

    exfil_scan = f"{scan_combined}\n{attachment_text}"
    tunnel_exposure = bool(_INTERNAL_SERVICE_TUNNEL.search(exfil_scan) and _SHARE_TUNNEL_LINK.search(exfil_scan))
    if category := ("data_exfiltration" if not educational_safe and "data_exfiltration" in policy.get("always_block", []) and (_has_any(exfil_scan, _PATTERNS["data_exfiltration"]) or tunnel_exposure) else None):
        return RuleResult("block", category, _risk_for_category(category, exfil_scan), "Запрос пытается передать секреты или внутренние данные на внешний адрес.")

    if "harmful_content" in policy.get("always_block", []) and _has_any(scan_combined, _PATTERNS["harmful_content"]):
        return RuleResult("block", "harmful_content", "critical", "Запрос содержит операционную инструкцию для причинения вреда или создания вредоносного инструмента.")

    if "abuse" in policy.get("always_block", []) and _has_any(scan_combined, _PATTERNS["abuse"]):
        return RuleResult("block", "abuse", "low", "Запрос направлен на угрозы, травлю, унижение или дискриминационные высказывания.")

    forbidden = policy.get("agents", {}).get("it_ops_agent", {}).get("forbidden_actions", [])
    if not educational_safe and any(action in _FORBIDDEN_ACTIONS and _FORBIDDEN_ACTIONS[action].search(scan_combined) for action in forbidden):
        return RuleResult("block", "tool_abuse", "critical", "Запрошено действие, запрещённое для всех ролей политикой безопасности.")
    if not educational_safe and _has_any(scan_combined, _CRITICAL_TOOL_PATTERNS):
        return RuleResult("block", "tool_abuse", "critical", "Запрошена опасная команда или необратимая операция, которая блокируется защитной политикой.")

    return None


def check_rbac(user_prompt: str, context: dict[str, Any], normalized_text: str | None = None) -> RuleResult | None:
    policy = get_policy()
    target_agent = str(context.get("target_agent") or "it_ops_agent")
    role = str(context.get("user_role") or "unknown").lower()
    if target_agent not in policy.get("agents", {}):
        return RuleResult("block", "tool_abuse", "high", f"Целевой агент {target_agent} отсутствует в политике безопасности.")
    text = normalized_text or user_prompt
    meta_request = bool(re.search(
        r"(?:summari[sz]e|review|analy[sz]e|explain|describe|translate|classify|audit|compare|"
        r"write (?:a |an )?(?:unit )?test|how should we test|как проверить|сравнени\w*|"
        r"перескажи|суммируй|объясни|переведи|классифицируй)",
        user_prompt,
        re.I,
    ))
    explicit_execution = bool(re.search(
        r"(?:^|[.!?;]\s*|\b(?:and then|then|now)\s+)(?:please\s+)?"
        r"(?:run|execute|deploy|apply|restart|reboot|delete|remove|destroy|drop|disable|wipe|erase|send|upload|forward|"
        r"выполни|запусти|разверни|примени|перезапусти|удали|отключи|сотри|отправь|перешли)\b",
        user_prompt,
        re.I,
    ))
    if meta_request and not explicit_execution:
        text = re.sub(r"```[\s\S]*?```|`[^`\n]*`|«[^»]*»|“[^”]*”|‘[^’]*’|\"[^\"]{3,}\"|(?<![A-Za-z0-9])'[^']{3,}'", " ", text)
    history_user = [str(item.get("content", "")) for item in context.get("history", [])
                    if isinstance(item, dict) and str(item.get("role", "user")).lower() == "user"]
    continuation = bool(re.search(r"\b(?:it|that|this|there|same)\b|\b(?:do it|go ahead|proceed|run it|execute it|confirm)\b|(?:сделай это|выполни это|продолжай|давай|подтверждаю|запусти это)", user_prompt, re.I))
    if continuation and history_user:
        text = "\n".join(history_user[-2:]) + "\n" + text

    safe_rotation = bool(re.search(
        r"(?:rotate|revoke|invalidate|replace|renew|отозвать|отзови|отзыв\w*|ротац\w*|перевыпуст\w*).{0,100}"
        r"(?:aws access key|access key|api key|secret|token|credential|ключ\w*|секрет\w*|токен\w*)",
        text,
        re.I,
    ))
    if safe_rotation and not _SECRET_VALUE.search(text) and not _SECRET_TRANSFER.search(text) and not _EXTERNAL_DESTINATION.search(text):
        return None

    if _ENCODED_SECRET_MARKER.search(text):
        return RuleResult("block", "unauthorized_data_access", "high", "После нормализации обнаружен маркер значения секрета или токена; раскрытие таких данных запрещено политикой.")
    if _SECRET_VALUE.search(text):
        return RuleResult("block", "unauthorized_data_access", "high", "Запрошено раскрытие значения секрета; политика запрещает выдачу значений секретов для всех ролей.")

    role_policy = policy.get("agents", {}).get(target_agent, {}).get("roles", {}).get(role, {})
    secret_rule = role_policy.get("secrets", "deny")
    if _SECRET_NAME_REQUEST.search(text):
        if secret_rule == "deny":
            return RuleResult("block", "unauthorized_data_access", "high", f"Политика запрещает роли {role} обращаться к секретам, включая их имена.")
        if secret_rule == "names_only":
            return RuleResult("allow", "none", "none", f"Для роли {role} разрешён просмотр только имён секретов; значения секретов не раскрываются.")
    elif _SECRET_ACCESS_REQUEST.search(text):
        return RuleResult("block", "unauthorized_data_access", "high", f"Запрос к содержимому или неопределённому набору секретов запрещён для роли {role}.")

    environment = _detect_environment(text, policy)
    sql_drop_table = bool(re.search(r"\bDROP\s+TABLE\b", text, re.I))
    explanatory_sql = bool(re.search(r"\b(?:explain|describe|what\s+(?:is|does)|how\s+does|why|analy[sz]e|review|translate|classify)\b|(?:объясни|расскажи|что\s+(?:такое|делает)|почему|проанализируй|переведи)", user_prompt, re.I))
    test_scope = bool(re.search(r"\b(?:dev|development|stage|staging|test|testing|qa|non.?prod)\b|(?:test|tmp|qa|dev)[_-]\w+|(?:тестов\w*|разработк\w*|стейдж)", text, re.I))
    if sql_drop_table and environment == "nonprod" and test_scope and not explanatory_sql:
        tool = "run_shell"
    else:
        tool = _detect_tool(text)
    if tool is None:
        return None
    if role not in {"developer", "sre", "admin"}:
        return RuleResult("block", "unauthorized_data_access", "high", "Доверенная роль пользователя отсутствует или не поддерживается политикой.")

    rule = _resolve_policy_rule(role, tool, environment, policy)
    if rule in {"deny", "block"}:
        category = "unauthorized_data_access" if tool == "read_logs" else "tool_abuse"
        env_label = "production" if environment == "prod" else "неопределённом окружении" if environment == "unknown" else "non-production"
        return RuleResult("block", category, _risk_for_category(category, text), f"Роль {role} не имеет права использовать {tool} в {env_label}; правило взято из security_policy.yaml.")
    if rule == "confirm":
        env_label = "production" if environment == "prod" else "неопределённом окружении" if environment == "unknown" else "non-production"
        return RuleResult("confirm", "sensitive_action", _risk_for_category("sensitive_action", text), f"Действие {tool} допустимо для роли {role} в {env_label}, но требует отдельного подтверждения.")
    if rule == "allow":
        return RuleResult("allow", "none", "none", f"Действие {tool} разрешено политикой для роли {role} в указанном окружении.")
    return None
