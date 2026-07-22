def test_state_contains_status_catalog(client, auth_headers):
    response = client.get("/api/state", headers=auth_headers)

    assert response.status_code == 200
    statuses = {item["code"]: item for item in response.json()["cellStatuses"]}
    assert set(statuses) == {"free", "occupied", "reserved"}
    assert statuses["free"]["isAvailable"] is True
    assert statuses["occupied"]["actions"] == ["move", "reserve", "delete"]
    assert statuses["reserved"]["actions"] == ["unreserve"]


def test_every_cell_uses_known_status(client, auth_headers):
    statuses = client.get("/api/cell-statuses", headers=auth_headers).json()
    warehouse = client.get("/api/warehouse", headers=auth_headers).json()
    known_codes = {status["code"] for status in statuses}

    assert warehouse["cells"]
    assert all(cell["status"] in known_codes for cell in warehouse["cells"])
