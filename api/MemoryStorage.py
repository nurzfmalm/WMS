from datetime import datetime, timezone
from threading import RLock

from models import Car, Dashboard, Invoice, InvoiceCar, Shipment, ShipmentCreate, Warehouse, ZoneOccupancy, BatchCreate

class MemoryStorage:
    def __init__(self, warehouse: Warehouse):
        self.warehouse = warehouse
        self._cars: dict[str, Car] = {}
        self._shipments: dict[int, Shipment] = {}
        self._invoices: dict[int, Invoice] = {}
        self._next_shipment_id = 1
        self._lock = RLock()

    def create_car(self, car: Car) -> Car:
        with self._lock:
            if car.vin in self._cars:
                raise ValueError("Машина уже существует")

            shipment = next(
                (
                    shipment
                    for shipment in self._shipments.values()
                    if car.vin in shipment.vins
                ),
                None,
            )
            if shipment is not None:
                raise ValueError(
                    f"Машина с VIN {car.vin} уже включена "
                    f"в заявку на отгрузку с ID {shipment.id}"
                )

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
                "shipments": [
                    shipment.model_copy(deep=True)
                    for shipment in self._shipments.values()
                ],
                "invoices": [
                    invoice.model_copy(deep=True)
                    for invoice in self._invoices.values()
                ],
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

    def create_shipment(self, shipment: ShipmentCreate) -> Shipment:
        with self._lock:
            if len(shipment.vins) != len(set(shipment.vins)):
                raise ValueError("Заявка содержит повторяющиеся VIN")

            waiting_vins = {
                vin
                for existing in self._shipments.values()
                if existing.status == "waiting for approval"
                for vin in existing.vins
            }
            for vin in shipment.vins:
                if vin in waiting_vins:
                    raise ValueError(f"Машина с VIN {vin} уже включена в другую заявку")
                car = self._cars.get(vin)
                if car is None:
                    raise ValueError(f"Машина с VIN {vin} не найдена")
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                    None,
                )
                if cell is None:
                    raise ValueError(f"Ячейка для машины с VIN {vin} не найдена")
                if cell.status != "reserved":
                    raise ValueError(f"Машина с VIN {vin} не зарезервирована")

            stored_shipment = Shipment(
                id=self._next_shipment_id,
                vins=list(shipment.vins),
                dealer=shipment.dealer,
                status="waiting for approval",
            )
            self._shipments[stored_shipment.id] = stored_shipment
            self._next_shipment_id += 1
            return stored_shipment.model_copy(deep=True)

    def get_shipments(self) -> list[Shipment]:
        with self._lock:
            return [
                shipment.model_copy(deep=True)
                for shipment in self._shipments.values()
            ]

    def get_invoices(self) -> list[Invoice]:
        with self._lock:
            return [invoice.model_copy(deep=True) for invoice in self._invoices.values()]

    def get_invoice(self, shipment_id: int) -> Invoice | None:
        with self._lock:
            invoice = self._invoices.get(shipment_id)
            return invoice.model_copy(deep=True) if invoice is not None else None

    def delete_shipment(self, shipment_id: int) -> Shipment | None:
        with self._lock:
            shipment = self._shipments.get(shipment_id)
            if shipment is None:
                return None
            if shipment.status == "shipped":
                raise ValueError(f"Заявка с ID {shipment_id} уже отгружена")

            for vin in shipment.vins:
                car = self._cars.get(vin)
                if car is None:
                    raise ValueError(f"Машина с VIN {vin} не найдена")

            invoice = Invoice(
                shipment_id=shipment.id,
                dealer=shipment.dealer,
                shipped_at=datetime.now(timezone.utc),
                cars=[
                    InvoiceCar(brand=self._cars[vin].model, vin=vin)
                    for vin in shipment.vins
                ],
            )

            for vin in shipment.vins:
                car = self._cars.pop(vin)
                cell = next(
                    (cell for cell in self.warehouse.cells if cell.id == car.cell_id),
                    None,
                )
                if cell is not None:
                    cell.status = "free"

            shipped = shipment.model_copy(update={"status": "shipped"}, deep=True)
            self._shipments[shipment_id] = shipped
            self._invoices[shipment_id] = invoice
            return shipped.model_copy(deep=True)

    def create_batch(self, batch: BatchCreate) -> list[Car]:
        with self._lock:
            cars_snapshot = self._cars.copy()
            statuses_snapshot = {
                cell.id: cell.status for cell in self.warehouse.cells
            }
            try:
                return [self.create_car(car) for car in batch.cars]
            except ValueError:
                self._cars = cars_snapshot
                for cell in self.warehouse.cells:
                    cell.status = statuses_snapshot[cell.id]
                raise

    def export_kpi(self) -> dict:
        with self._lock:
            total_cars = len(self._cars)
            total_cells = len(self.warehouse.cells)
            occupied_cells = sum(cell.status == "occupied" for cell in self.warehouse.cells)
            reserved_cells = sum(cell.status == "reserved" for cell in self.warehouse.cells)
            free_cells = total_cells - occupied_cells - reserved_cells
            percentage_occupied = (occupied_cells / total_cells) * 100 if total_cells > 0 else 0

            now = datetime.now(timezone.utc)
            storage_times_hours = []
            for car in self._cars.values():
                arrival_time = car.arrival_time
                if arrival_time.tzinfo is None:
                    arrival_time = arrival_time.replace(tzinfo=timezone.utc)
                storage_times_hours.append(
                    max(0.0, (now - arrival_time).total_seconds() / 3600)
                )

            average_storage_time = (
                sum(storage_times_hours) / total_cars if total_cars > 0 else 0
            )
            shipmentsCount = len(self._shipments)

            return {
                "percentage_occupied": percentage_occupied,
                "average_storage_time": average_storage_time,
                "shipmentsCount": shipmentsCount,
            }
