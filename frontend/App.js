const api = "http://127.0.0.1:8000";

const carForm = document.getElementById("carForm");
const deleteCarForm = document.getElementById("deleteCarForm");
const findCarForm = document.getElementById("findCarForm");
const replaceCarForm = document.getElementById("replaceCarForm");
const fifoForm = document.getElementById("fifoForm");
const vinInput = document.getElementById("vinInput");
const deleteVinInput = document.getElementById("deleteVinInput");
const findVinInput = document.getElementById("findVinInput");
const findModelInput = document.getElementById("findModelInput");
const replaceVinInput = document.getElementById("replaceVinInput");
const replaceCellIdInput = document.getElementById("replaceCellIdInput");
const fifoModelInput = document.getElementById("fifoModelInput");
const modelInput = document.getElementById("modelInput");
const cellIdInput = document.getElementById("cellIdInput");
const message = document.getElementById("message");
const totalCars = document.getElementById("totalCars");
const occupiedCells = document.getElementById("occupiedCells");
const freeCells = document.getElementById("freeCells");
const zoneDashboard = document.getElementById("zoneDashboard");
const refreshDashboardButton = document.getElementById("refreshDashboard");

function renderDashboard(data) {
    totalCars.textContent = data.totalCars;
    occupiedCells.textContent = `${data.occupiedCells} / ${data.totalCells}`;
    freeCells.textContent = data.freeCells;
    zoneDashboard.replaceChildren();

    data.zones.forEach((zone) => {
        const percent = zone.total === 0 ? 0 : Math.round((zone.occupied / zone.total) * 100);
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
        zoneDashboard.append(card);
    });
}

async function loadDashboard() {
    refreshDashboardButton.disabled = true;
    try {
        const response = await fetch(`${api}/dashboard`);
        if (!response.ok) throw new Error("Dashboard request failed");
        renderDashboard(await response.json());
    } catch (error) {
        zoneDashboard.innerHTML = '<p class="dashboard-status dashboard-status--error">Не удалось загрузить дашборд. Проверьте соединение с API.</p>';
    } finally {
        refreshDashboardButton.disabled = false;
    }
}

refreshDashboardButton.addEventListener("click", loadDashboard);

carForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const car = {
        vin: vinInput.value,
        model: modelInput.value,
    };

    

    if (cellIdInput.value) {
        car.cellId = cellIdInput.value;
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
        carForm.reset();
        await loadDashboard();
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

deleteCarForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = deleteVinInput.value;
    
    try {
        const response = await fetch(`${api}/car/${vin}`, {
            method: "DELETE",
        });

        if (!response.ok) {
            const data = await response.json();
            message.textContent = data.detail || "Не удалось удалить машину";
            return;
        } else {
            message.textContent = `Машина ${vin} удалена`;
            deleteCarForm.reset();
            await loadDashboard();
        }
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

findCarForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin = findVinInput.value;
    const model = findModelInput.value;

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

replaceCarForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const vin = replaceVinInput.value;
    const newCellId = replaceCellIdInput.value;

    try {
        const response = await fetch(
            `${api}/car/${encodeURIComponent(vin)}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    cellId: newCellId,
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
        replaceCarForm.reset();
        await loadDashboard();
    } catch (error) {
        message.textContent = "Нет связи с API";
    }
});

loadDashboard();

fifoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const model = fifoModelInput.value;

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
