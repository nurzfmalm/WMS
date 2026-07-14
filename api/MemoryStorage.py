from threading import Lock

from models import Car, Dashboard, Warehouse, ZoneOccupancy

class MemoryStorage:
    def __init__(self, warehouse: Warehouse):
        self.warehouse = warehouse
        self._cars: dict[str, Car] = {}
        self._lock = Lock()

    def create_car(self, car: Car) -> Car:
        with self._lock:
            if car.vin in self._cars:
                raise ValueError("Car already exists")

            if car.cellId is None:
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.status == "free"),
                    None,
                )
                if cell is None:
                    raise ValueError("No free cells")
            else:
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.Id == car.cellId),
                    None,
                )
                if cell is None:
                    raise ValueError("Cell not found")
                if cell.status != "free":
                    raise ValueError("Cell is occupied")

            placed_car = car.model_copy(update={"cellId": cell.Id})
            cell.status = "occupied"
            self._cars[placed_car.vin] = placed_car
            return placed_car

    def get_car(self, vin: str) -> Car | None:
        with self._lock:
            return self._cars.get(vin)

    def get_cars(self) -> list[Car]:
        with self._lock:
            return list(self._cars.values())

    def delete_car(self, vin: str) -> bool:
        with self._lock:
            car = self._cars.pop(vin, None)
            if car is None:
                return False

            cell = next(
                (cell for cell in self.warehouse.cells if cell.Id == car.cellId),
                None,
            )
            if cell is not None:
                cell.status = "free"
            return True

    def get_dashboard(self) -> Dashboard:
        with self._lock:
            zone_names = list(dict.fromkeys(cell.zone for cell in self.warehouse.cells))
            zones = []
            for zone_name in zone_names:
                zone_cells = [cell for cell in self.warehouse.cells if cell.zone == zone_name]
                occupied = sum(cell.status == "occupied" for cell in zone_cells)
                zones.append(ZoneOccupancy(
                    zone=zone_name,
                    total=len(zone_cells),
                    occupied=occupied,
                    free=len(zone_cells) - occupied,
                ))

            occupied_cells = sum(zone.occupied for zone in zones)
            total_cells = len(self.warehouse.cells)
            return Dashboard(
                totalCars=len(self._cars),
                totalCells=total_cells,
                occupiedCells=occupied_cells,
                freeCells=total_cells - occupied_cells,
                zones=zones,
            )
    
    def get_cars_by_model(self, model: str) -> list[Car]:
        with self._lock:
            return [car for car in self._cars.values() if car.model == model]

    def get_first_car_by_model(self, model: str) -> Car | None:
        with self._lock:
            cars = (car for car in self._cars.values() if car.model == model)
            return min(cars, key=lambda car: car.arrivalTime, default=None)
    
    def move_car(self, vin: str, new_cell_id: str) -> Car:
        with self._lock:
            car = self._cars.get(vin)
            if car is None:
                raise ValueError("Car not found")
    
            old_cell = next(
                (cell for cell in self.warehouse.cells if cell.Id == car.cellId),
                None,
            )
            new_cell = next(
                (cell for cell in self.warehouse.cells if cell.Id == new_cell_id),
                None,
            )
    
            if new_cell is None:
                raise ValueError("Cell not found")
    
            if new_cell.status != "free":
                raise ValueError("Cell is occupied")
    
            if old_cell is not None:
                old_cell.status = "free"
    
            new_cell.status = "occupied"
    
            moved_car = car.model_copy(update={"cellId": new_cell_id})
            self._cars[vin] = moved_car
    
            return moved_car
