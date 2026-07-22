def test_shipment_creates_invoice_and_frees_cell(client, auth_headers, add_car):
    vin = "VIN-SHIP-001"
    add_car(vin, "A-1-1", model="Lada Vesta")
    assert client.patch(f"/api/reserve/{vin}", headers=auth_headers).status_code == 200

    created = client.post(
        "/api/ship",
        json={"dealer": "Dealer One", "vins": [vin]},
        headers=auth_headers,
    )
    assert created.status_code == 200
    shipment_id = created.json()["id"]

    shipped = client.delete(f"/api/ship/{shipment_id}", headers=auth_headers)
    assert shipped.status_code == 200
    assert shipped.json()["status"] == "shipped"
    assert client.get(f"/api/car/{vin}", headers=auth_headers).status_code == 404

    invoice = client.get(f"/api/invoice/{shipment_id}", headers=auth_headers)
    assert invoice.status_code == 200
    assert invoice.json()["dealer"] == "Dealer One"
    assert invoice.json()["cars"] == [{"brand": "Lada Vesta", "vin": vin}]

    csv_response = client.get(f"/api/invoice/{shipment_id}/csv", headers=auth_headers)
    assert csv_response.status_code == 200
    assert vin in csv_response.text

    state = client.get("/api/state", headers=auth_headers).json()
    cell = next(cell for cell in state["warehouse"]["cells"] if cell["Id"] == "A-1-1")
    assert cell["status"] == "free"
