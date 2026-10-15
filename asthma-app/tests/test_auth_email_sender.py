"""Code emails use the verified Lobelia sender and send replies to support (Resend mocked)."""

from services import auth_email


async def test_code_email_sender_and_reply_to(monkeypatch):
    sent = []
    monkeypatch.setattr(auth_email.resend, "api_key", "test-key")
    monkeypatch.setattr(auth_email.resend.Emails, "send", lambda payload: sent.append(payload) or {"id": "x"})

    await auth_email._send_code_email("user@example.com", "123456", subject="Your Lobelia signup code", heading="Hi")

    assert sent[0]["from"] == "Lobelia <noreply@lobelia.app>"
    assert sent[0]["reply_to"] == "support@lobelia.app"
    assert sent[0]["to"] == "user@example.com"
