"""Feedback endpoint with Resend mocked (no database or email sent)."""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from services import feedback_service


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(feedback_service.resend, "api_key", "test-key")
    monkeypatch.setattr(feedback_service.resend.Emails, "send", lambda payload: calls.append(payload) or {"id": "x"})
    feedback_service._recent.clear()
    return calls


def test_feedback_is_emailed_to_support_and_escaped(sent):
    client = TestClient(app)
    response = client.post(
        "/v1/feedback",
        json={"message": "Love it <script>x</script>", "category": "idea", "allow_reply": True,
              "email": "tester@example.com", "page": "#/profile", "app_version": "prototype"},
        headers={"User-Agent": "QA-Agent"},
    )

    assert response.status_code == 202
    payload = sent[0]
    assert payload["to"] == "support@lobelia.app"
    assert payload["subject"] == "Lobelia feedback: idea"
    assert payload["reply_to"] == "tester@example.com"
    assert "&lt;script&gt;" in payload["html"] and "<script>" not in payload["html"]
    assert "QA-Agent" in payload["html"] and "#/profile" in payload["html"]


def test_no_reply_address_unless_allowed(sent):
    TestClient(app).post("/v1/feedback", json={"message": "bug here", "category": "bug", "email": "a@example.com"})
    assert "reply_to" not in sent[0]


def test_rate_limited_after_five(sent):
    client = TestClient(app)
    codes = [client.post("/v1/feedback", json={"message": f"note {i}"}).status_code for i in range(6)]
    assert codes == [202] * 5 + [429]
    assert len(sent) == 5


@pytest.mark.parametrize("body", [{"message": "   "}, {"message": "x" * 5001}, {"message": "hi", "category": "rant"}, {"message": "hi", "email": "not-an-email"}])
def test_invalid_feedback_rejected(sent, body):
    assert TestClient(app).post("/v1/feedback", json=body).status_code in (400, 422)
    assert sent == []


def test_send_failure_is_reported(monkeypatch):
    feedback_service._recent.clear()
    monkeypatch.setattr(feedback_service.resend, "api_key", "test-key")

    def boom(payload):
        raise RuntimeError("resend down")

    monkeypatch.setattr(feedback_service.resend.Emails, "send", boom)
    response = TestClient(app).post("/v1/feedback", json={"message": "hello"})
    assert response.status_code == 502
