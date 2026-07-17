import csv
import io
import json
from pathlib import Path
import pandas as pd
from fastapi.responses import StreamingResponse


from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, HTTPException

from MemoryStorage import MemoryStorage
from models import Car, Cell, MoveCar, ShipmentCreate, Warehouse, WarehouseConfig, BatchCreate


topology_path = Path(__file__).parent / "topology.json"

with topology_path.open(encoding="utf-8") as file:
    topology_data = json.load(file)

config = WarehouseConfig.model_validate(topology_data)

cells = []

for zone in config.zones:
    for row in range(1, zone.rows + 1):
        for index in range(1, zone.cells_per_row + 1):
            cells.append(
                Cell(
                    id=f"{zone.name}-{row}-{index}",
                    zone=zone.name,
                    row=row,
                    index=index,
                    status="free",
                )
            )

warehouse = Warehouse(
    id=config.id,
    name=config.name,
    location=config.location,
    cells=cells,
)
storage = MemoryStorage(warehouse)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/warehouse")
def get_warehouse():
    return storage.warehouse


@app.get("/api/dashboard")
def get_dashboard():
    return storage.get_dashboard()


@app.get("/api/state")
def get_state():
    return storage.get_state()


@app.post("/api/car")
def create_car(car: Car):
    try:
        return storage.create_car(car)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


@app.get("/api/car/{vin}")
def get_car(vin: str):
    car = storage.get_car(vin)

    if car is None:
        raise HTTPException(status_code=404, detail="Машина не найдена")

    return car

@app.get("/api/cars")
def get_cars():
    return storage.get_cars()

@app.delete("/api/car/{vin}")
def delete_car(vin: str):
    try:
        if not storage.delete_car(vin):
            raise HTTPException(status_code=404, detail="Машина не найдена")
        return {"deleted": True, "vin": vin}
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


@app.get("/api/cars/{model}")
def get_car_by_model(model: str):
    cars = storage.get_cars_by_model(model)
    if not cars:
        raise HTTPException(status_code=404, detail="Машины не найдены")
    return cars

@app.patch("/api/car/{vin}")
def move_car(vin: str, request: MoveCar):
    try:
        return storage.move_car(vin, request.cell_id)
    except ValueError as error:
        message = str(error)
        status_code = 404 if message in ("Машина не найдена", "Ячейка не найдена") else 409
        raise HTTPException(status_code=status_code, detail=message)
    
@app.get("/api/fifo/{model}")
def fifo_car(model: str):
    car = storage.get_first_car_by_model(model)
    if car is None:
        raise HTTPException(status_code=404, detail="Машины не найдены")
    return car

@app.patch("/api/reserve/{vin}")
def reserve_car(vin: str):
    try:
        return storage.reserve_car(vin)
    except ValueError as error:
        message = str(error)
        status_code = 404 if message in ("Машина не найдена", "Ячейка не найдена") else 409
        raise HTTPException(status_code=status_code, detail=message)

@app.get("/api/unreserve/{vin}")
def unreserve_car(vin: str):
    try:
        return storage.unreserve_car(vin)
    except ValueError as error:
        message = str(error)
        status_code = 404 if message in ("Машина не найдена", "Ячейка не найдена") else 409
        raise HTTPException(status_code=status_code, detail=message)

@app.get("/api/csv")
def get_csv_data():
    cars = storage.get_cars()
    cell_statuses = {cell.id: cell.status for cell in storage.warehouse.cells}

    rows_by_model = {}
    for car in cars:
        row = rows_by_model.setdefault(
            car.model,
            {
                "Модель": car.model,
                "Общее": 0,
                "Свободно к продаже": 0,
                "Резерв": 0,
            },
        )
        row["Общее"] += 1

        if cell_statuses.get(car.cell_id) == "reserved":
            row["Резерв"] += 1
        else:
            row["Свободно к продаже"] += 1

    columns = ["Модель", "Общее", "Свободно к продаже", "Резерв"]
    df = pd.DataFrame(rows_by_model.values(), columns=columns)

    csv_data = "\ufeff" + df.to_csv(index=False, sep=";", encoding="utf-8")

    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="data.csv"'
        },
    )

@app.post("/api/ship")
def create_shipment(shipment: ShipmentCreate):
    try:
        return storage.create_shipment(shipment)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

@app.get("/api/shipments")
def get_shipments():
    return storage.get_shipments()

@app.get("/api/invoices")
def get_invoices():
    return storage.get_invoices()

@app.get("/api/invoice/{shipment_id}")
def get_invoice(shipment_id: int):
    invoice = storage.get_invoice(shipment_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Накладная не найдена")
    return invoice

@app.get("/api/invoice/{shipment_id}/csv")
def get_invoice_csv(shipment_id: int):
    invoice = storage.get_invoice(shipment_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Накладная не найдена")

    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["ID заявки", "Время отгрузки", "Дилер", "Марка", "VIN"])
    for car in invoice.cars:
        writer.writerow([
            invoice.shipment_id,
            invoice.shipped_at.isoformat(),
            invoice.dealer,
            car.brand,
            car.vin,
        ])

    csv_data = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="invoice-{shipment_id}.csv"'
            )
        },
    )

@app.delete("/api/ship/{shipment_id}")
def delete_shipment(shipment_id: int):
    try:
        shipment = storage.delete_shipment(shipment_id)
        if shipment is None:
            raise HTTPException(status_code=404, detail="Отгрузка не найдена")
        return shipment
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

@app.post("/api/batch")
def create_batch(batch: BatchCreate | list[Car]):
    try:
        normalized_batch = batch if isinstance(batch, BatchCreate) else BatchCreate(cars=batch)
        return storage.create_batch(normalized_batch)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

@app.get("/api/kpi")
def get_kpi():
    return storage.export_kpi()
