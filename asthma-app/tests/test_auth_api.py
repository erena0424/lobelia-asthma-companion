"""Authentication API tests."""

from fastapi.testclient import TestClient


def test_signup_code_and_reset_code_endpoints(client: TestClient, monkeypatch):
    async def fake_send_code_email(*args, **kwargs):
        return {"ok": True}

    monkeypatch.setattr("services.auth_email._send_code_email", fake_send_code_email)

    signup_code = client.post("/v1/auth/signup-code", json={"email": "signup-code@example.com"})
    assert signup_code.status_code == 200, signup_code.text

    signup_verify = client.post(
        "/v1/auth/signup-code/verify",
        json={"email": "signup-code@example.com", "code": "123456"},
    )
    assert signup_verify.status_code == 400

    monkeypatch.setattr("services.auth_email._make_code", lambda: "123456")
    signup_code = client.post("/v1/auth/signup-code", json={"email": "signup-code@example.com"})
    assert signup_code.status_code == 200, signup_code.text

    signup_verify = client.post(
        "/v1/auth/signup-code/verify",
        json={"email": "signup-code@example.com", "code": "123456"},
    )
    assert signup_verify.status_code == 200, signup_verify.text

    register = client.post(
        "/v1/auth/register",
        json={"email": "signup-code@example.com", "password": "password12345", "name": "Signup Code User"},
    )
    assert register.status_code == 201

    monkeypatch.setattr("services.auth_email._make_code", lambda: "654321")
    reset_code = client.post("/v1/auth/reset-code", json={"email": "signup-code@example.com"})
    assert reset_code.status_code == 200, reset_code.text

    reset_verify = client.post(
        "/v1/auth/reset-code/verify",
        json={"email": "signup-code@example.com", "code": "654321"},
    )
    assert reset_verify.status_code == 200, reset_verify.text


def test_register_and_login(client: TestClient):
    register = client.post(
        "/v1/auth/register",
        json={
            "email": "auth@example.com",
            "password": "password12345",
            "name": "Auth User",
        },
    )
    assert register.status_code == 201
    token = register.json()["access_token"]
    assert token

    login = client.post(
        "/v1/auth/login",
        json={"email": "auth@example.com", "password": "password12345"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]

    me = client.get("/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "auth@example.com"
    assert me.json()["name"] == "Auth User"


def test_duplicate_email_conflict(client: TestClient):
    payload = {"email": "dup@example.com", "password": "password12345"}
    assert client.post("/v1/auth/register", json=payload).status_code == 201
    dup = client.post("/v1/auth/register", json=payload)
    assert dup.status_code == 409
    assert dup.json()["code"] == "EMAIL_EXISTS"


def test_protected_route_requires_auth(client: TestClient):
    response = client.get("/v1/users/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_refresh_token(client: TestClient):
    register = client.post(
        "/v1/auth/register",
        json={"email": "refresh@example.com", "password": "password12345"},
    )
    assert register.status_code == 201
    old_token = register.json()["access_token"]

    refreshed = client.post("/v1/auth/refresh", json={"access_token": old_token})
    assert refreshed.status_code == 200, refreshed.text
    new_token = refreshed.json()["access_token"]
    assert new_token

    me = client.get("/v1/users/me", headers={"Authorization": f"Bearer {new_token}"})
    assert me.status_code == 200


def test_refresh_without_token_returns_401(client: TestClient):
    response = client.post("/v1/auth/refresh", json={})
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_reset_password_updates_login_credentials(client: TestClient, monkeypatch):
    payload = {"email": "reset@example.com", "password": "password12345"}

    register = client.post("/v1/auth/register", json=payload)
    assert register.status_code == 201

    async def fake_send_code_email(*args, **kwargs):
        return {"ok": True}

    # never send a real email from the test suite
    monkeypatch.setattr("services.auth_email._send_code_email", fake_send_code_email)
    monkeypatch.setattr("services.auth_email._make_code", lambda: "222222")
    reset_code = client.post("/v1/auth/reset-code", json={"email": payload["email"]})
    assert reset_code.status_code == 200, reset_code.text

    reset = client.post(
        "/v1/auth/reset-password",
        json={"email": payload["email"], "password": "newPassword123!", "code": "222222"},
    )
    assert reset.status_code == 200, reset.text

    old_login = client.post("/v1/auth/login", json=payload)
    assert old_login.status_code == 401

    new_login = client.post(
        "/v1/auth/login",
        json={"email": payload["email"], "password": "newPassword123!"},
    )
    assert new_login.status_code == 200

