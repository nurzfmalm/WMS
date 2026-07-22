def test_two_cars_cannot_occupy_same_cell(client, auth_headers, add_car):
    add_car("VIN-RULE-001", "A-1-1")

    response = client.post(
        "/api/car",
        json={"vin": "VIN-RULE-002", "model": "Lada Granta", "cellId": "A-1-1"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Ячейка занята"


def test_reserved_car_cannot_be_moved_or_deleted(client, auth_headers, add_car):
    vin = "VIN-RULE-003"
    add_car(vin, "A-1-1")
    assert client.patch(f"/api/reserve/{vin}", headers=auth_headers).status_code == 200

    moved = client.patch(
        f"/api/car/{vin}",
        json={"cellId": "A-1-2"},
        headers=auth_headers,
    )
    deleted = client.delete(f"/api/car/{vin}", headers=auth_headers)

    assert moved.status_code == 409
    assert deleted.status_code == 409


def test_shipment_accepts_only_reserved_cars(client, auth_headers, add_car):
    vin = "VIN-RULE-004"
    add_car(vin, "A-1-1")

    response = client.post(
        "/api/ship",
        json={"dealer": "Dealer", "vins": [vin]},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "не зарезервирована" in response.json()["detail"]
