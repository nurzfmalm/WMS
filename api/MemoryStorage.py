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
                raise ValueError("Машина уже существует")

            if car.cell_id is None:
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.status == "free"),
                    None,
                )
                if cell is None:
                    raise ValueError("Нет свободных ячеек")
            else:
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                    None,
                )
                if cell is None:
                    raise ValueError("Ячейка не найдена")
                if cell.status != "free":
                    raise ValueError("Ячейка занята")

            placed_car = car.model_copy(update={"cell_id": cell.id})
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
            car = self._cars.get(vin)
            if car is None:
                return False

            cell = next(
                (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                None,
            )
            if cell is not None and cell.status == "reserved":
                raise ValueError("Машина зарезервирована")

            del self._cars[vin]
            if cell is not None:
                cell.status = "free"
            return True

    def _get_dashboard_unlocked(self) -> Dashboard:
        zone_names = list(dict.fromkeys(cell.zone for cell in self.warehouse.cells))
        zones = []
        for zone_name in zone_names:
            zone_cells = [cell for cell in self.warehouse.cells if cell.zone == zone_name]
            occupied = sum(cell.status == "occupied" for cell in zone_cells)
            reserved = sum(cell.status == "reserved" for cell in zone_cells)
            zones.append(ZoneOccupancy(
                zone=zone_name,
                total=len(zone_cells),
                occupied=occupied,
                reserved=reserved,
                free=len(zone_cells) - occupied - reserved,
            ))

        occupied_cells = sum(zone.occupied for zone in zones)
        reserved_cells = sum(zone.reserved for zone in zones)
        total_cells = len(self.warehouse.cells)
        return Dashboard(
            total_cars=len(self._cars),
            total_cells=total_cells,
            occupied_cells=occupied_cells,
            reserved_cells=reserved_cells,
            free_cells=total_cells - occupied_cells - reserved_cells,
            zones=zones,
        )

    def get_dashboard(self) -> Dashboard:
        with self._lock:
            return self._get_dashboard_unlocked()

    def get_state(self) -> dict:
        """Return one internally consistent snapshot for the frontend."""
        with self._lock:
            return {
                "warehouse": self.warehouse.model_copy(deep=True),
                "dashboard": self._get_dashboard_unlocked(),
                "cars": [car.model_copy(deep=True) for car in self._cars.values()],
            }

    def get_cars_by_model(self, model: str) -> list[Car]:
        with self._lock:
            return [car for car in self._cars.values() if car.model == model]

    def get_first_car_by_model(self, model: str) -> Car | None:
        with self._lock:
            cars = (car for car in self._cars.values() if car.model == model)
            return min(cars, key=lambda car: car.arrival_time, default=None)

    def move_car(self, vin: str, new_cell_id: str) -> Car:
        with self._lock:
            car = self._cars.get(vin)
            if car is None:
                raise ValueError("Машина не найдена")

            old_cell = next(
                (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                None,
            )
            new_cell = next(
                (cell for cell in self.warehouse.cells if cell.id == new_cell_id),
                None,
            )

            if old_cell is not None and old_cell.status == "reserved":
                raise ValueError("Машина зарезервирована")

            if new_cell is None:
                raise ValueError("Ячейка не найдена")

            if new_cell.status != "free":
                raise ValueError("Ячейка занята")

            if old_cell is not None:
                old_cell.status = "free"
    
            new_cell.status = "occupied"
    
            moved_car = car.model_copy(update={"cell_id": new_cell_id})
            self._cars[vin] = moved_car
    
            return moved_car

    def reserve_car(self, vin: str) -> Car:
        with self._lock:
            car = self._cars.get(vin)
            if car is None:
                raise ValueError("Машина не найдена")

            cell = next(
                (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                None,
            )

            if cell is None:
                raise ValueError("Ячейка не найдена")

            if cell.status == "reserved":
                raise ValueError("Машина уже зарезервирована")
            if cell.status != "occupied":
                raise ValueError("Ячейка не занята")

            cell.status = "reserved"

            reserved_car = car.model_copy(update={"cell_id": cell.id})
            self._cars[vin] = reserved_car

            return reserved_car

    def unreserve_car(self, vin: str) -> Car:
        with self._lock:
            car = self._cars.get(vin)
            if car is None:
                raise ValueError("Машина не найдена")

            cell = next(
                (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                None,
            )

            if cell is None:
                raise ValueError("Ячейка не найдена")

            if cell.status != "reserved":
                raise ValueError("Машина не зарезервирована")

            cell.status = "occupied"

            unreserved_car = car.model_copy(update={"cell_id": cell.id})
            self._cars[vin] = unreserved_car

            return unreserved_car
