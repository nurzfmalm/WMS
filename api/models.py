from datetime import datetime, timezone

from pydantic import BaseModel, Field

class Car(BaseModel):
    vin: str
    model: str
    cellId: str | None = None
    arrivalTime: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

class Cell(BaseModel):
    Id: str
    zone: str
    row: int
    index: int
    status: str

class Warehouse(BaseModel):
    Id: str
    name: str
    location: str
    cells: list[Cell] = Field(default_factory=list)


class ZoneConfig(BaseModel):
    name: str
    rows: int
    cellsPerRow: int


class WarehouseConfig(BaseModel):
    Id: str
    name: str
    location: str
    zones: list[ZoneConfig]

class MoveCar(BaseModel):
    cellId: str


class ZoneOccupancy(BaseModel):
    zone: str
    total: int
    occupied: int
    free: int


class Dashboard(BaseModel):
    totalCars: int
    totalCells: int
    occupiedCells: int
    freeCells: int
    zones: list[ZoneOccupancy]
