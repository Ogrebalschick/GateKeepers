import base64
import binascii
import re
import unicodedata
from typing import Any

_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)
_B64_RE = re.compile(r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{4,}={0,2}(?![A-Za-z0-9+/=])")

_CONFUSABLES = str.maketrans({
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x",
    "у": "y", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h",
    "А": "A", "Е": "E", "О": "O", "Р": "P", "С": "C", "Х": "X",
    "У": "Y", "К": "K", "М": "M", "Т": "T", "В": "B", "Н": "H",
})
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def _decode_base64_candidates(text: str) -> list[str]:
    decoded: list[str] = []
    for match in _B64_RE.finditer(text):
        token = match.group(0)
        if len(token) < 8 and "=" not in token:
            continue
        if len(token) % 4:
            token += "=" * (4 - len(token) % 4)
        try:
            raw = base64.b64decode(token, validate=True)
            value = raw.decode("utf-8", errors="strict")
        except (binascii.Error, UnicodeDecodeError, ValueError):
            continue
        if len(value) >= 3 and sum(ch.isprintable() or ch in "\r\n\t" for ch in value) / len(value) >= 0.88:
            decoded.append(value)
    return decoded


def _compact_spaced_letters(text: str) -> str:
    pattern = re.compile(r"(?<![A-Za-zА-Яа-яЁё])(?:[A-Za-zА-Яа-яЁё]\s+){2,}[A-Za-zА-Яа-яЁё](?![A-Za-zА-Яа-яЁё])")
    return pattern.sub(lambda match: re.sub(r"\s+", "", match.group(0)), text)


def normalize(text: str) -> str:
    if not text:
        return ""
    value = unicodedata.normalize("NFKC", str(text)).translate(_ZERO_WIDTH)
    value = value.replace("\u00ad", "")
    additions = _decode_base64_candidates(value)
    if re.search(r"read\s+(?:it\s+)?backwards|backwards\s+and\s+do|задом\s+нап[её]р[её]д|прочитай\s+наоборот|прочитай\s+задом", value, re.I):
        reversed_value = value[::-1]
        additions.append(reversed_value)
    spaced = _compact_spaced_letters(value)
    if spaced != value:
        additions.append(spaced)
    confusable = value.translate(_CONFUSABLES)
    if confusable != value:
        additions.append(confusable)
    leet = value.translate(_LEET)
    if leet != value:
        additions.append(leet)
    value = re.sub(r"[ \t\r\n]+", " ", value).strip()
    normalized_additions = [re.sub(r"[ \t\r\n]+", " ", x).strip() for x in additions if x.strip()]
    return value + ("\n" + "\n".join(dict.fromkeys(normalized_additions)) if normalized_additions else "")


def normalize_attachments(attachments: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    result = []
    for item in attachments or []:
        if not isinstance(item, dict):
            continue
        result.append({**item, "content": normalize(str(item.get("content", "")))})
    return result


def normalize_history(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    result = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        result.append({"role": str(item.get("role", "user")), "content": normalize(str(item.get("content", "")))})
    return result


def extract_text_for_analysis(user_prompt: str, attachments: list[dict[str, Any]] | None = None,
                              history: list[dict[str, Any]] | None = None) -> str:
    chunks = [f"CURRENT_USER_REQUEST\n{normalize(user_prompt)}"]
    for item in normalize_history(history):
        if item["role"].lower() == "user":
            chunks.append(f"HISTORY_USER\n{item['content']}")
    for item in normalize_attachments(attachments):
        chunks.append(f"ATTACHMENT {item.get('name', 'unnamed')}\n{item.get('content', '')}")
    return "\n\n".join(chunks)
