const API = "https://wms-xxgh.vercel.app/api";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let warehouse = null;
let cars = [];
let activeZone = "all";
let shipments = [];
let invoices = [];

const statusNames = { free: "Свободно", occupied: "Занято", reserved: "В резерве" };

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, options);
    let data = null;
    try { data = await response.json(); } catch (_) { /* Ответ без JSON допустим. */ }
    if (!response.ok) {
        const fallback = response.status === 404
            ? "Запись не найдена. Данные API могли быть сброшены — обновите карту."
            : response.status === 409
                ? "Операция недоступна для текущего состояния автомобиля."
                : "Не удалось выполнить операцию";
        const error = new Error(data?.detail || fallback);
        error.status = response.status;
        throw error;
    }
    return data;
}

function showMessage(text, isError = false) {
    const box = $("#message");
    box.textContent = text;
    box.className = `message show${isError ? " error" : ""}`;
}

function carForCell(cellId) { return cars.find((car) => car.cellId === cellId); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = String(value ?? ""); return node.innerHTML; }

function renderLogistics() {
    $("#shipmentCount").textContent = shipments.length;
    $("#invoiceCount").textContent = invoices.length;
    $("#shipmentList").innerHTML = shipments.length ? [...shipments].reverse().map((shipment) => {
        const waiting = shipment.status === "waiting for approval";
        return `<article class="shipment-card"><div><h4>Заявка №${shipment.id}<span class="shipment-status${waiting ? "" : " shipped"}">${waiting ? "Ожидает подтверждения" : "Отгружена"}</span></h4><p>${escapeHtml(shipment.dealer)} · ${shipment.vins.length} авто<br>${shipment.vins.map(escapeHtml).join(", ")}</p></div><div class="shipment-card__actions">${waiting ? `<button class="button button--primary" data-ship-id="${shipment.id}" type="button">Подтвердить отгрузку</button>` : `<a class="button button--ghost" href="${API}/invoice/${shipment.id}/csv">CSV накладной</a>`}</div></article>`;
    }).join("") : '<div class="empty-state">Заявок пока нет</div>';
    $("#invoiceList").innerHTML = invoices.length ? [...invoices].reverse().map((invoice) => `<article class="invoice-card"><div><h4>Накладная к заявке №${invoice.shipmentId}</h4><p>${escapeHtml(invoice.dealer)} · ${new Date(invoice.shippedAt).toLocaleString("ru-RU")} · ${invoice.cars.length} авто<br>${invoice.cars.map((car) => `${escapeHtml(car.brand)} — ${escapeHtml(car.vin)}`).join(", ")}</p></div><a class="button button--ghost" href="${API}/invoice/${invoice.shipmentId}/csv">Скачать CSV</a></article>`).join("") : '<div class="empty-state">Накладных пока нет</div>';
}

function renderSummary(data) {
    $("#totalCars").textContent = data.totalCars;
    $("#occupiedCells").textContent = `${data.occupiedCells} / ${data.totalCells}`;
    $("#freeCells").textContent = data.freeCells;
    $("#reservedCells").textContent = data.reservedCells;
    $("#occupiedPercent").textContent = `${data.totalCells ? Math.round((data.occupiedCells + data.reservedCells) / data.totalCells * 100) : 0}% вместимости`;
}

function renderFilters() {
    const zones = [...new Set(warehouse.cells.map((cell) => cell.zone))];
    $("#zoneFilters").innerHTML = ["all", ...zones].map((zone) =>
        `<button class="zone-filter${activeZone === zone ? " active" : ""}" data-zone="${zone}" type="button">${zone === "all" ? "Все" : zone}</button>`
    ).join("");
}

function renderMap() {
    if (!warehouse) return;
    const query = $("#mapSearch").value.trim().toLowerCase();
    const zones = [...new Set(warehouse.cells.map((cell) => cell.zone))].filter((zone) => activeZone === "all" || activeZone === zone);
    const html = zones.map((zone) => {
        const zoneCells = warehouse.cells.filter((cell) => cell.zone === zone);
        const rows = [...new Set(zoneCells.map((cell) => cell.row))];
        const rowHtml = rows.map((row) => `<div class="zone-row">${zoneCells.filter((cell) => cell.row === row).sort((a,b) => a.index-b.index).map((cell) => {
            const car = carForCell(cell.Id);
            const searchable = `${cell.Id} ${car?.vin || ""} ${car?.model || ""}`.toLowerCase();
            const highlight = query && searchable.includes(query);
            return `<button class="cell cell--${cell.status}${highlight ? " highlight" : ""}" data-cell="${cell.Id}" type="button" title="${cell.Id} — ${statusNames[cell.status] || cell.status}"><span class="cell__id">${cell.Id}</span>${cell.status !== "free" ? '<span class="cell__car">◆</span>' : ""}<span class="cell__model">${car?.model || "свободно"}</span></button>`;
        }).join("")}</div>`).join("");
        const free = zoneCells.filter((cell) => cell.status === "free").length;
        return `<section class="zone-block"><div class="zone-name">ЗОНА ${zone}<small>${free}/${zoneCells.length} свободно</small></div><div class="zone-rows">${rowHtml}</div></section>`;
    }).join("");
    $("#warehouseGrid").innerHTML = html || '<div class="loading">Нет ячеек для отображения</div>';
}

function openCell(cellId) {
    const cell = warehouse.cells.find((item) => item.Id === cellId);
    const car = carForCell(cellId);
    $("#dialogTitle").textContent = `Ячейка ${cell.Id}`;
    const carActions = car && cell.status === "reserved"
        ? `<div class="dialog-actions"><p class="eyebrow">ДЕЙСТВИЯ</p><p class="dialog-actions__notice">Перед перемещением или удалением снимите автомобиль с резерва.</p><button class="button button--ghost" data-dialog-reserve data-vin="${car.vin}" data-reserved="true" type="button">Снять резерв</button></div>`
        : car
            ? `<div class="dialog-actions"><p class="eyebrow">ДЕЙСТВИЯ</p><form class="dialog-move" data-dialog-move data-vin="${car.vin}"><input name="cellId" type="text" placeholder="Новая ячейка, например B-1-2" required><button class="button button--primary" type="submit">Переместить</button></form><div class="dialog-actions__row"><button class="button button--ghost" data-dialog-reserve data-vin="${car.vin}" data-reserved="false" type="button">Поставить в резерв</button><button class="button button--danger" data-dialog-delete data-vin="${car.vin}" type="button">Удалить автомобиль</button></div></div>`
            : "";
    $("#dialogContent").innerHTML = `<div class="detail-list"><div class="detail"><span>СТАТУС</span><b class="status-pill ${cell.status}">${statusNames[cell.status] || cell.status}</b></div><div class="detail"><span>ЗОНА / РЯД</span><b>${cell.zone} / ${cell.row}</b></div>${car ? `<div class="detail"><span>АВТОМОБИЛЬ</span><b>${car.model}</b></div><div class="detail"><span>VIN</span><b>${car.vin}</b></div><div class="detail"><span>ДАТА ПРИЁМА</span><b>${new Date(car.arrivalTime).toLocaleString("ru-RU")}</b></div>` : '<div class="detail"><span>РАЗМЕЩЕНИЕ</span><b>Ячейка доступна</b></div>'}</div>${carActions}`;
    $("#cellDialog").hidden = false;
}

async function runDialogAction(action, successMessage) {
    const controls = $$("#dialogContent button, #dialogContent input");
    controls.forEach((control) => { control.disabled = true; });
    try {
        await action();
        $("#cellDialog").hidden = true;
        showMessage(successMessage);
        await loadData();
    } catch (error) {
        showMessage(error.message, true);
        controls.forEach((control) => { control.disabled = false; });
    }
}

async function loadData() {
    const button = $("#refreshDashboard");
    button.disabled = true;
    try {
        const [state, shipmentData, invoiceData] = await Promise.all([apiRequest("/state"), apiRequest("/shipments"), apiRequest("/invoices")]);
        warehouse = state.warehouse;
        cars = state.cars;
        shipments = shipmentData;
        invoices = invoiceData;
        $("#warehouseName").textContent = warehouse.name || "Управление складом";
        $("#warehouseLocation").textContent = warehouse.location ? `Складской комплекс · ${warehouse.location}` : "Складской комплекс";
        renderSummary(state.dashboard);
        renderFilters();
        renderMap();
        renderLogistics();
        $("#lastUpdate").textContent = `Обновлено ${new Date().toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"})}`;
    } catch (error) {
        $("#warehouseGrid").innerHTML = `<div class="loading">Не удалось загрузить карту. ${error.message}</div>`;
        showMessage(`Ошибка загрузки: ${error.message}`, true);
    } finally { button.disabled = false; }
}

function bindForm(id, handler) {
    $(id).addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const result = await handler();
            showMessage(result);
            form.reset();
            await loadData();
        } catch (error) { showMessage(error.message, true); }
        finally { submit.disabled = false; }
    });
}

bindForm("#carForm", async () => {
    const payload = { vin: $("#vinInput").value.trim(), model: $("#modelInput").value.trim() };
    if ($("#cellIdInput").value.trim()) payload.cellId = $("#cellIdInput").value.trim();
    const car = await apiRequest("/car", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
    return `Автомобиль ${car.vin} принят в ячейку ${car.cellId}`;
});
bindForm("#deleteCarForm", async () => { const vin=$("#deleteVinInput").value.trim(); await apiRequest(`/car/${encodeURIComponent(vin)}`,{method:"DELETE"}); return `Автомобиль ${vin} удалён со склада`; });
bindForm("#reserveCarForm", async () => { const car=await apiRequest(`/reserve/${encodeURIComponent($("#reserveVinInput").value.trim())}`,{method:"PATCH"}); return `Автомобиль ${car.vin} поставлен в резерв`; });
bindForm("#unreserveCarForm", async () => { const car=await apiRequest(`/unreserve/${encodeURIComponent($("#unreserveVinInput").value.trim())}`); return `Резерв автомобиля ${car.vin} снят`; });
bindForm("#replaceCarForm", async () => { const car=await apiRequest(`/car/${encodeURIComponent($("#replaceVinInput").value.trim())}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({cellId:$("#replaceCellIdInput").value.trim()})}); return `Автомобиль ${car.vin} перемещён в ${car.cellId}`; });
bindForm("#batchForm", async () => {
    const lines = $("#batchInput").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const batchCars = lines.map((line, index) => {
        const [vin, model, cellId] = line.split(";").map((part) => part.trim());
        if (!vin || !model) throw new Error(`Строка ${index + 1}: укажите VIN и модель через точку с запятой`);
        return {vin, model, ...(cellId ? {cellId} : {})};
    });
    const created = await apiRequest("/batch", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({cars:batchCars})});
    return `Принято автомобилей: ${created.length}`;
});
bindForm("#shipmentForm", async () => {
    const vins = $("#shipmentVinsInput").value.split(/[\s,;]+/).map((vin) => vin.trim()).filter(Boolean);
    if (!vins.length) throw new Error("Добавьте хотя бы один VIN");
    const shipment = await apiRequest("/ship", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({dealer:$("#dealerInput").value.trim(), vins})});
    return `Заявка №${shipment.id} создана`;
});

$("#findCarForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const vin=$("#findVinInput").value.trim(), model=$("#findModelInput").value.trim();
    if (!vin && !model) return showMessage("Укажите VIN или модель", true);
    try {
        const result = vin ? [await apiRequest(`/car/${encodeURIComponent(vin)}`)] : await apiRequest(`/cars/${encodeURIComponent(model)}`);
        showMessage(result.map((car)=>`${car.model} · VIN ${car.vin} · ячейка ${car.cellId}`).join("; "));
        $("#mapSearch").value = vin || model;
        renderMap();
    } catch(error) { showMessage(error.message,true); }
});
$("#fifoForm").addEventListener("submit", async (event) => { event.preventDefault(); try { const car=await apiRequest(`/fifo/${encodeURIComponent($("#fifoModelInput").value.trim())}`); showMessage(`Первый по FIFO: ${car.model} · VIN ${car.vin} · ячейка ${car.cellId}`); } catch(error){showMessage(error.message,true);} });

$("#refreshDashboard").addEventListener("click", loadData);
$("#exportButton").addEventListener("click", () => { window.location.href = `${API}/csv`; });
$("#mapSearch").addEventListener("input", renderMap);
$("#zoneFilters").addEventListener("click", (event) => { const button=event.target.closest("[data-zone]"); if(!button)return; activeZone=button.dataset.zone; renderFilters(); renderMap(); });
$("#warehouseGrid").addEventListener("click", (event) => { const cell=event.target.closest("[data-cell]"); if(cell) openCell(cell.dataset.cell); });
$("#shipmentList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-ship-id]");
    if (!button || !window.confirm(`Подтвердить отгрузку по заявке №${button.dataset.shipId}? Автомобили будут удалены со склада.`)) return;
    button.disabled = true;
    try { await apiRequest(`/ship/${button.dataset.shipId}`, {method:"DELETE"}); showMessage(`Заявка №${button.dataset.shipId} отгружена, накладная сформирована`); await loadData(); }
    catch (error) { showMessage(error.message, true); button.disabled = false; }
});
$("#dialogContent").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-dialog-move]");
    if (!form) return;
    event.preventDefault();
    const vin = form.dataset.vin;
    const cellId = new FormData(form).get("cellId").trim();
    runDialogAction(() => apiRequest(`/car/${encodeURIComponent(vin)}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({cellId})}), `Автомобиль ${vin} перемещён в ячейку ${cellId}`);
});
$("#dialogContent").addEventListener("click", (event) => {
    const reserveButton = event.target.closest("[data-dialog-reserve]");
    if (reserveButton) {
        const vin = reserveButton.dataset.vin;
        const reserved = reserveButton.dataset.reserved === "true";
        runDialogAction(() => apiRequest(`/${reserved ? "unreserve" : "reserve"}/${encodeURIComponent(vin)}`, reserved ? {} : {method:"PATCH"}), reserved ? `Резерв автомобиля ${vin} снят` : `Автомобиль ${vin} поставлен в резерв`);
        return;
    }
    const deleteButton = event.target.closest("[data-dialog-delete]");
    if (deleteButton) {
        const vin = deleteButton.dataset.vin;
        if (!window.confirm(`Удалить автомобиль ${vin} со склада?`)) return;
        runDialogAction(() => apiRequest(`/car/${encodeURIComponent(vin)}`, {method:"DELETE"}), `Автомобиль ${vin} удалён со склада`);
    }
});
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => { $("#cellDialog").hidden=true; }));
document.addEventListener("keydown", (event) => { if(event.key === "Escape") $("#cellDialog").hidden=true; });
$$('.operation-tab').forEach((tab) => tab.addEventListener("click", () => { $$('.operation-tab').forEach(t=>t.classList.toggle("active",t===tab)); $$('.operation-form').forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===tab.dataset.tab)); }));

$("#mapSearch").value = "";
loadData();
