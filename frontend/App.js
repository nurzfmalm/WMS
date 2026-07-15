const api = "https://api-self-delta-89.vercel.app/api";

const car_form = document.getElementById("carForm");
const delete_car_form = document.getElementById("deleteCarForm");
const reserve_car_form = document.getElementById("reserveCarForm");
const find_car_form = document.getElementById("findCarForm");
const replace_car_form = document.getElementById("replaceCarForm");
const fifo_form = document.getElementById("fifoForm");
const unreserve_car_form = document.getElementById("unreserveCarForm");
const vin_input = document.getElementById("vinInput");
const delete_vin_input = document.getElementById("deleteVinInput");
const reserve_vin_input = document.getElementById("reserveVinInput");
const find_vin_input = document.getElementById("findVinInput");
const find_model_input = document.getElementById("findModelInput");
const replace_vin_input = document.getElementById("replaceVinInput");
const replace_cell_id_input = document.getElementById("replaceCellIdInput");
const fifo_model_input = document.getElementById("fifoModelInput");
const model_input = document.getElementById("modelInput");
const cell_id_input = document.getElementById("cellIdInput");
const message = document.getElementById("message");
const total_cars = document.getElementById("totalCars");
const occupied_cells = document.getElementById("occupiedCells");
const free_cells = document.getElementById("freeCells");
const reserved_cells = document.getElementById("reservedCells");
const zone_dashboard = document.getElementById("zoneDashboard");
const refresh_dashboard_button = document.getElementById("refreshDashboard");
const unreserve_vin_input = document.getElementById("unreserveVinInput");

function render_dashboard(data) {
    total_cars.textContent = data.totalCars;
    occupied_cells.textContent = `${data.occupiedCells} / ${data.totalCells}`;
    free_cells.textContent = data.freeCells;
    reserved_cells.textContent = data.reservedCells;
    zone_dashboard.replaceChildren();

    data.zones.forEach((zone) => {
        const percent = zone.total === 0 ? 0 : Math.round(((zone.occupied + zone.reserved) / zone.total) * 100);
        const card = document.createElement("article");
        card.className = "zone-card";
        card.innerHTML = `
            <div class="zone-card__title"><strong>Зона ${zone.zone}</strong><span>${percent}% занято</span></div>
            <div class="progress" role="progressbar" aria-label="Занятость зоны ${zone.zone}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
                <span style="width: ${percent}%"></span>
            </div>
            <div class="zone-card__stats">
                <span><b class="occupied-dot"></b>Занято: ${zone.occupied}</span>
                <span><b class="free-dot"></b>Свободно: ${zone.free}</span>
                <span>Всего: ${zone.total}</span>
            </div>`;
        zone_dashboard.append(card);
    });
}

async function load_dashboard() {
    refresh_dashboard_button.disabled = true;
    try {
        const response = await fetch(`${api}/dashboard`);
        if (!response.ok) throw new Error("Dashboard request failed");
        render_dashboard(await response.json());
    } catch (error) {
        zone_dashboard.innerHTML = '<p class="dashboard-status dashboard-status--error">Не удалось загрузить дашборд. Проверьте соединение с API.</p>';
    } finally {
        refresh_dashboard_button.disabled = false;
    }
}

refresh_dashboard_button.addEventListener("click", load_dashboard);

car_form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const car = {
        vin: vin_input.value,
        model: model_input.value,
    };

    

    if (cell_id_input.value) {
        car.cellId = cell_id_input.value;
    }

    try {
        const response = await fetch(`${api}/car`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(car),
        });

        const data = await response.json();

        if (!response.ok) {
            message.textContent = data.detail || "Не удалось добавить машину";
            return;
        }

        message.textContent = `Машина ${data.vin} добавлена в ячейку ${data.cellId}`;
        car_form.reset();
        await load_dashboard();
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

delete_car_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = delete_vin_input.value;
    
    try {
        const response = await fetch(`${api}/car/${encodeURIComponent(vin)}`, {
            method: "DELETE",
        });

        if (!response.ok) {
            const data = await response.json();
            message.textContent = data.detail || "Не удалось удалить машину";
            return;
        } else {
            message.textContent = `Машина ${vin} удалена`;
            delete_car_form.reset();
            await load_dashboard();
        }
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

reserve_car_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = reserve_vin_input.value;

    try {
        const response = await fetch(`${api}/reserve/${encodeURIComponent(vin)}`, {
            method: "PATCH",
        });
        const data = await response.json();

        if (!response.ok) {
            message.textContent = data.detail || "Не удалось зарезервировать машину";
            return;
        }

        message.textContent = `Машина ${data.vin} зарезервирована`;
        reserve_car_form.reset();
        await load_dashboard();
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

find_car_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = find_vin_input.value;
    const model = find_model_input.value;

    try {
        if(vin != "" && model == "") {
            const response = await fetch(`${api}/car/${vin}`);
            const data = await response.json();

            if (!response.ok) {
                message.textContent = data.detail || "Машина не найдена";
            } else {
                message.textContent = `Машина найдена: ${data.vin}, Модель: ${data.model}, Ячейка: ${data.cellId}, Время прибытия: ${data.arrivalTime}`;
            }
        } else if(model != "" && vin == "") {
            const response = await fetch(`${api}/cars/${model}`);
            const data = await response.json();

            if (!response.ok) {
                message.textContent = data.detail || "Машины не найдены";
            } else {
                message.textContent = `Машины найдены: ${data.map(car => `VIN: ${car.vin}, Модель: ${car.model}, Ячейка: ${car.cellId}, Время прибытия: ${car.arrivalTime}`).join("; ")}`;
            }
        }
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

replace_car_form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const vin = replace_vin_input.value;
    const new_cell_id = replace_cell_id_input.value;

    try {
        const response = await fetch(
            `${api}/car/${encodeURIComponent(vin)}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    cellId: new_cell_id,
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            message.textContent =
                data.detail || "Не удалось переместить машину";
            return;
        }

        message.textContent =
            `Машина ${data.vin} перемещена в ячейку ${data.cellId}`;
        replace_car_form.reset();
        await load_dashboard();
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

load_dashboard();

fifo_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const model = fifo_model_input.value;

    try {
        const response = await fetch(`${api}/fifo/${encodeURIComponent(model)}`, {
            method: "GET",
        });
        const data = await response.json();

        if (!response.ok) {
            message.textContent = data.detail || "Машины не найдены";
        } else {
            message.textContent = `FIFO: VIN: ${data.vin}, Модель: ${data.model}, Ячейка: ${data.cellId}, Время прибытия: ${data.arrivalTime}`;
        }
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

unreserve_car_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = unreserve_vin_input.value;
    
    try {
        const response = await fetch(`${api}/unreserve/${encodeURIComponent(vin)}`, {
            method: "PATCH",
        });
        
        const data = await response.json();
        if (!response.ok) {
            message.textContent = data.detail || "Не удалось снять резерв";
        } else {
            message.textContent = `Резерв снят для машины ${data.vin}`;
        }
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

function exportData() {
    window.location.href = `${api}/csv`;
}