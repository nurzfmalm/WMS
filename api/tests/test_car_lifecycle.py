def test_complete_car_lifecycle(client, auth_headers, add_car):
    vin = "VIN-LIFECYCLE-001"
    created = add_car(vin, "A-1-1")
    assert created["cellId"] == "A-1-1"

    moved = client.patch(
        f"/api/car/{vin}",
        json={"cellId": "A-1-2"},
        headers=auth_headers,
    )
    assert moved.status_code == 200
    assert moved.json()["cellId"] == "A-1-2"

    assert client.patch(f"/api/reserve/{vin}", headers=auth_headers).status_code == 200
    state = client.get("/api/state", headers=auth_headers).json()
    cell = next(cell for cell in state["warehouse"]["cells"] if cell["Id"] == "A-1-2")
    assert cell["status"] == "reserved"

    assert client.get(f"/api/unreserve/{vin}", headers=auth_headers).status_code == 200
    assert client.delete(f"/api/car/{vin}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/car/{vin}", headers=auth_headers).status_code == 404

    state = client.get("/api/state", headers=auth_headers).json()
    cell = next(cell for cell in state["warehouse"]["cells"] if cell["Id"] == "A-1-2")
    assert cell["status"] == "free"
