import json
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, HTTPException

from MemoryStorage import MemoryStorage
from models import Car, Cell, MoveCar, Warehouse, WarehouseConfig


topology_path = Path(__file__).parent / "topology.json"

with topology_path.open(encoding="utf-8") as file:
    topology_data = json.load(file)

config = WarehouseConfig.model_validate(topology_data)

cells = []

for zone in config.zones:
    for row in range(1, zone.rows + 1):
        for index in range(1, zone.cellsPerRow + 1):
            cells.append(
                Cell(
                    Id=f"{zone.name}-{row}-{index}",
                    zone=zone.name,
                    row=row,
                    index=index,
                    status="free",
                )
            )

warehouse = Warehouse(
    Id=config.Id,
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
        raise HTTPException(status_code=404, detail="Car not found")

    return car

@app.get("/api/cars")
def get_cars():
    return storage.get_cars()

@app.delete("/api/car/{vin}")
def delete_car(vin: str):
    if not storage.delete_car(vin):
        raise HTTPException(status_code=404, detail="Car not found")
    return {"deleted": True, "vin": vin}
    

@app.get("/api/cars/{model}")
def get_car_by_model(model: str):
    cars = storage.get_cars_by_model(model)
    if not cars:
        raise HTTPException(status_code=404, detail="Cars not found")
    return cars

@app.patch("/api/car/{vin}")
def move_car(vin: str, request: MoveCar):
    try:
        return storage.move_car(vin, request.cellId)
    except ValueError as error:
        message = str(error)
        status_code = 404 if message in ("Car not found", "Cell not found") else 409
        raise HTTPException(status_code=status_code, detail=message)
    
@app.get("/api/fifo/{model}")
def fifo_car(model: str):
    car = storage.get_first_car_by_model(model)
    if car is None:
        raise HTTPException(status_code=404, detail="Cars not found")
    return car
