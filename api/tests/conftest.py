import pytest
from fastapi.testclient import TestClient

import api
from AuthStorage import AuthStorage
from MemoryStorage import MemoryStorage
from models import Cell, Warehouse


def fresh_warehouse() -> Warehouse:
    cells = [
        Cell(
            id=f"{zone.name}-{row}-{index}",
            zone=zone.name,
            row=row,
            index=index,
            status="free",
        )
        for zone in api.config.zones
        for row in range(1, zone.rows + 1)
        for index in range(1, zone.cells_per_row + 1)
    ]
    return Warehouse(
        id=api.config.id,
        name=api.config.name,
        location=api.config.location,
        cells=cells,
    )


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api, "storage", MemoryStorage(fresh_warehouse()))
    monkeypatch.setattr(api, "auth_storage", AuthStorage())
    with TestClient(api.app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client):
    response = client.post(
        "/api/auth/register",
        json={"username": "operator", "password": "secret1"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def add_car(client, auth_headers):
    def _add(vin: str, cell_id: str | None = None, model: str = "Lada Vesta"):
        payload = {"vin": vin, "model": model}
        if cell_id is not None:
            payload["cellId"] = cell_id
        response = client.post("/api/car", json=payload, headers=auth_headers)
        assert response.status_code == 200, response.text
        return response.json()

    return _add
