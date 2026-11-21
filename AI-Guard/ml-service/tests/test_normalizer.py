from app.utils.normalizer import normalize, normalize_attachments, normalize_history


def test_base64_decode_short_and_long():
    assert "test" in normalize("Decode dGVzdA==")
    assert "timeout=30" in normalize("Decode dGltZW91dD0zMCwgcmV0cmllcz0z")


def test_zero_width_characters_are_removed():
    assert normalize("H\u200be\u200bl\u200bl\u200bo") .splitlines()[0] == "Hello"


def test_spaced_and_confusable_variants_are_added():
    value = normalize("I g n o r e")
    assert "Ignore" in value
    assert "h" in normalize("Игнoрируй").lower()


def test_attachments_and_history_are_normalized():
    attachments = normalize_attachments([{"name": "a.txt", "content": "H\u200be\u200bl\u200bl\u200bo"}])
    history = normalize_history([{"role": "user", "content": "dGVzdA=="}])
    assert attachments[0]["content"].startswith("Hello")
    assert "test" in history[0]["content"]
