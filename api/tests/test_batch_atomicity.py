def test_failed_batch_does_not_create_any_cars(client, auth_headers):
    response = client.post(
        "/api/batch",
        json={
            "cars": [
                {"vin": "VIN-BATCH-001", "model": "Model A", "cellId": "A-1-1"},
                {"vin": "VIN-BATCH-002", "model": "Model B", "cellId": "A-1-1"},
            ]
        },
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert client.get("/api/cars", headers=auth_headers).json() == []
    state = client.get("/api/state", headers=auth_headers).json()
    cell = next(cell for cell in state["warehouse"]["cells"] if cell["Id"] == "A-1-1")
    assert cell["status"] == "free"


def test_valid_batch_creates_all_cars(client, auth_headers):
    response = client.post(
        "/api/batch",
        json={
            "cars": [
                {"vin": "VIN-BATCH-003", "model": "Model A", "cellId": "A-1-1"},
                {"vin": "VIN-BATCH-004", "model": "Model B", "cellId": "A-1-2"},
            ]
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert len(response.json()) == 2
