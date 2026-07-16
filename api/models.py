from datetime import datetime, timezone

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Car(ApiModel):
    vin: str
    model: str
    cell_id: str | None = Field(default=None, alias="cellId")
    arrival_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        alias="arrivalTime",
    )


class Cell(ApiModel):
    id: str = Field(alias="Id")
    zone: str
    row: int
    index: int
    status: str

class Warehouse(ApiModel):
    id: str = Field(alias="Id")
    name: str
    location: str
    cells: list[Cell] = Field(default_factory=list)


class ZoneConfig(ApiModel):
    name: str
    rows: int
    cells_per_row: int = Field(alias="cellsPerRow")


class WarehouseConfig(ApiModel):
    id: str = Field(alias="Id")
    name: str
    location: str
    zones: list[ZoneConfig]

class MoveCar(ApiModel):
    cell_id: str = Field(alias="cellId")


class ZoneOccupancy(ApiModel):
    zone: str
    total: int
    occupied: int
    reserved: int
    free: int


class Dashboard(ApiModel):
    total_cars: int = Field(alias="totalCars")
    total_cells: int = Field(alias="totalCells")
    occupied_cells: int = Field(alias="occupiedCells")
    reserved_cells: int = Field(alias="reservedCells")
    free_cells: int = Field(alias="freeCells")
    zones: list[ZoneOccupancy]


class ShipmentCreate(ApiModel):
    vins: list[str]
    dealer: str


class Shipment(ShipmentCreate):
    id: int = Field(ge=1)
    status: Literal["waiting for approval", "shipped"]


class InvoiceCar(ApiModel):
    brand: str
    vin: str


class Invoice(ApiModel):
    shipment_id: int = Field(ge=1, alias="shipmentId")
    dealer: str
    shipped_at: datetime = Field(alias="shippedAt")
    cars: list[InvoiceCar]

class BatchCreate(ApiModel):
    cars: list[Car]