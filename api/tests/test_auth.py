def test_protected_endpoint_requires_token(client):
    response = client.get("/api/state")

    assert response.status_code == 401
    assert response.json()["detail"] == "Требуется вход в систему"


def test_register_login_and_logout(client):
    credentials = {"username": "operator", "password": "secret1"}

    registered = client.post("/api/auth/register", json=credentials)
    assert registered.status_code == 200
    token = registered.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/state", headers=headers).status_code == 200

    logged_in = client.post("/api/auth/login", json=credentials)
    assert logged_in.status_code == 200
    assert logged_in.json()["username"] == "operator"

    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/state", headers=headers).status_code == 401


def test_duplicate_user_and_wrong_password_are_rejected(client):
    credentials = {"username": "operator", "password": "secret1"}
    assert client.post("/api/auth/register", json=credentials).status_code == 200

    duplicate = client.post("/api/auth/register", json=credentials)
    wrong_password = client.post(
        "/api/auth/login",
        json={"username": "operator", "password": "wrong12"},
    )

    assert duplicate.status_code == 409
    assert wrong_password.status_code == 401
