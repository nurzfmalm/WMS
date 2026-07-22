const API = "http://wms-xxgh.vercel.app/api";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let warehouse = null;
let cars = [];
let shipments = [];
let invoices = [];
let cellStatuses = [];
let activeZone = "all";
let messageTimer = null;
let authMode = "login";
let authToken = localStorage.getItem("wmsToken") || "";
let authUsername = localStorage.getItem("wmsUsername") || "";

function statusInfo(code) {
  return cellStatuses.find((status) => status.code === code) || { code, label: code, color: "#e8ebef", isAvailable: false, actions: [] };
}

function showAuth() {
  $("#authScreen").hidden = false;
  $("#appShell").hidden = true;
}

function showApp() {
  $("#authScreen").hidden = true;
  $("#appShell").hidden = false;
  $("#currentUser").textContent = authUsername;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const fallback = response.status === 404
      ? "Запись не найдена. Данные API могли быть сброшены — обновите страницу."
      : response.status === 409
        ? "Операция недоступна для текущего состояния автомобиля."
        : "Не удалось выполнить операцию";
    const error = new Error(data?.detail || fallback);
    error.status = response.status;
    if (response.status === 401 && !path.startsWith("/auth/")) {
      authToken = "";
      localStorage.removeItem("wmsToken");
      showAuth();
    }
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function showMessage(text, isError = false) {
  const box = $("#message");
  clearTimeout(messageTimer);
  box.textContent = text;
  box.className = `message show${isError ? " error" : ""}`;
  messageTimer = setTimeout(() => { box.className = "message"; }, 6000);
}

function carForCell(cellId) {
  return cars.find((car) => car.cellId === cellId);
}

function downloadCsv(filename, rows) {
  const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportKpi() {
  const button = $("#exportKpiButton");
  button.disabled = true;
  try {
    const kpi = await apiRequest("/kpi");
    downloadCsv(`wms-kpi-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Показатель", "Значение", "Единица измерения"],
      ["Загрузка склада", Number(kpi.percentage_occupied).toFixed(2), "%"],
      ["Среднее время хранения", Number(kpi.average_storage_time).toFixed(2), "часов"],
      ["Количество заявок на отгрузку", kpi.shipmentsCount, "шт."],
    ]);
    showMessage("KPI экспортированы в CSV");
  } catch (error) {
    showMessage(`Не удалось экспортировать KPI: ${error.message}`, true);
  } finally { button.disabled = false; }
}

function renderSummary(data) {
  $("#totalCars").textContent = data.totalCars;
  $("#occupiedCells").textContent = `${data.occupiedCells} / ${data.totalCells}`;
  $("#freeCells").textContent = data.freeCells;
  $("#reservedCells").textContent = data.reservedCells;
  const used = data.occupiedCells + data.reservedCells;
  $("#occupiedPercent").textContent = `${data.totalCells ? Math.round(used / data.totalCells * 100) : 0}% вместимости`;
  $("#zoneSummary").innerHTML = data.zones.map((zone) => {
    const usedInZone = zone.occupied + zone.reserved;
    const percent = zone.total ? Math.round(usedInZone / zone.total * 100) : 0;
    return `<div class="zone-load"><div class="zone-load__head"><b>Зона ${escapeHtml(zone.zone)}</b><span>${percent}%</span></div><div class="zone-load__track"><div class="zone-load__bar" style="width:${percent}%"></div></div></div>`;
  }).join("");
}

function renderFilters() {
  const zones = [...new Set(warehouse.cells.map((cell) => cell.zone))];
  $("#zoneFilters").innerHTML = ["all", ...zones].map((zone) =>
    `<button class="zone-filter${activeZone === zone ? " active" : ""}" data-zone="${escapeHtml(zone)}" type="button">${zone === "all" ? "Все" : escapeHtml(zone)}</button>`
  ).join("");
}

function renderMap() {
  if (!warehouse) return;
  const query = $("#mapSearch").value.trim().toLowerCase();
  const zones = [...new Set(warehouse.cells.map((cell) => cell.zone))]
    .filter((zone) => activeZone === "all" || activeZone === zone);
  const html = zones.map((zone) => {
    const zoneCells = warehouse.cells.filter((cell) => cell.zone === zone);
    const rows = [...new Set(zoneCells.map((cell) => cell.row))];
    const rowHtml = rows.map((row) => {
      const cells = zoneCells.filter((cell) => cell.row === row).sort((a, b) => a.index - b.index);
      return `<div class="zone-row">${cells.map((cell) => {
        const car = carForCell(cell.Id);
        const searchable = `${cell.Id} ${car?.vin || ""} ${car?.model || ""}`.toLowerCase();
        const visible = !query || searchable.includes(query);
        const status = statusInfo(cell.status);
        const style = `${visible ? "" : "opacity:.18;"}--cell-status-color:${escapeHtml(status.color)}`;
        return `<button class="cell cell--dynamic${query && visible ? " highlight" : ""}" data-cell="${escapeHtml(cell.Id)}" type="button" title="${escapeHtml(cell.Id)} — ${escapeHtml(status.label)}" style="${style}"><span class="cell__id">${escapeHtml(cell.Id)}</span>${car ? '<span class="cell__car">◆</span>' : ""}<span class="cell__model">${escapeHtml(car?.model || status.label)}</span></button>`;
      }).join("")}</div>`;
    }).join("");
    const free = zoneCells.filter((cell) => statusInfo(cell.status).isAvailable).length;
    return `<section class="zone-block"><div class="zone-name">ЗОНА ${escapeHtml(zone)}<small>${free}/${zoneCells.length} свободно</small></div><div class="zone-rows">${rowHtml}</div></section>`;
  }).join("");
  $("#warehouseGrid").innerHTML = html || '<div class="empty-state">Нет ячеек для отображения</div>';
}

function renderLogistics() {
  const downloadToken = encodeURIComponent(authToken);
  $("#shipmentCount").textContent = shipments.length;
  $("#invoiceCount").textContent = invoices.length;
  $("#shipmentList").innerHTML = shipments.length ? [...shipments].reverse().map((shipment) => {
    const waiting = shipment.status === "waiting for approval";
    return `<article class="shipment-card"><div><h4>Заявка №${shipment.id}<span class="shipment-status${waiting ? "" : " shipped"}">${waiting ? "Ожидает подтверждения" : "Отгружено"}</span></h4><p>${escapeHtml(shipment.dealer)} · ${shipment.vins.length} авто<br>${shipment.vins.map(escapeHtml).join(", ")}</p></div><div class="shipment-card__actions">${waiting ? `<button class="button button--primary" data-ship-id="${shipment.id}" type="button">Подтвердить отгрузку</button>` : `<a class="button button--secondary" href="${API}/invoice/${shipment.id}/csv?token=${downloadToken}">CSV накладной</a>`}</div></article>`;
  }).join("") : '<div class="empty-state">Заявок пока нет</div>';
  $("#invoiceList").innerHTML = invoices.length ? [...invoices].reverse().map((invoice) =>
    `<article class="invoice-card"><div><h4>Накладная к заявке №${invoice.shipmentId}</h4><p>${escapeHtml(invoice.dealer)} · ${new Date(invoice.shippedAt).toLocaleString("ru-RU")} · ${invoice.cars.length} авто<br>${invoice.cars.map((car) => `${escapeHtml(car.brand)} — ${escapeHtml(car.vin)}`).join(", ")}</p></div><a class="button button--secondary" href="${API}/invoice/${invoice.shipmentId}/csv?token=${downloadToken}"><span class="material-symbols-outlined">download</span>Скачать CSV</a></article>`
  ).join("") : '<div class="empty-state">Накладных пока нет</div>';
}

function openCell(cellId) {
  const cell = warehouse.cells.find((item) => item.Id === cellId);
  const car = carForCell(cellId);
  $("#dialogTitle").textContent = `Ячейка ${cell.Id}`;
  const status = statusInfo(cell.status);
  const allowed = new Set(status.actions);
  const actionParts = [];
  if (car && allowed.has("move")) actionParts.push(`<form class="dialog-move" data-dialog-move data-vin="${escapeHtml(car.vin)}"><input name="cellId" type="text" placeholder="Новая ячейка, например B-1-2" required><button class="button button--primary" type="submit">Переместить</button></form>`);
  if (car && allowed.has("reserve")) actionParts.push(`<button class="button button--secondary" data-dialog-reserve data-vin="${escapeHtml(car.vin)}" data-reserved="false" type="button">В резерв</button>`);
  if (car && allowed.has("unreserve")) actionParts.push(`<button class="button button--secondary" data-dialog-reserve data-vin="${escapeHtml(car.vin)}" data-reserved="true" type="button">Снять резерв</button>`);
  if (car && allowed.has("delete")) actionParts.push(`<button class="button button--danger" data-dialog-delete data-vin="${escapeHtml(car.vin)}" type="button">Удалить</button>`);
  const actions = actionParts.length ? `<div class="dialog-actions"><span class="overline">ДЕЙСТВИЯ</span><div class="dialog-actions__row">${actionParts.join("")}</div></div>` : "";
  $("#dialogContent").innerHTML = `<div class="detail-list"><div class="detail"><span>СТАТУС</span><b class="status-pill" style="--cell-status-color:${escapeHtml(status.color)}">${escapeHtml(status.label)}</b></div><div class="detail"><span>ЗОНА / РЯД</span><b>${escapeHtml(cell.zone)} / ${cell.row}</b></div>${car ? `<div class="detail"><span>АВТОМОБИЛЬ</span><b>${escapeHtml(car.model)}</b></div><div class="detail"><span>VIN</span><b>${escapeHtml(car.vin)}</b></div><div class="detail"><span>ДАТА ПРИЁМА</span><b>${new Date(car.arrivalTime).toLocaleString("ru-RU")}</b></div>` : `<div class="detail"><span>РАЗМЕЩЕНИЕ</span><b>${status.isAvailable ? "Ячейка доступна" : "Ячейка недоступна"}</b></div>`}</div>${actions}`;
  $("#cellDialog").hidden = false;
}

async function loadData() {
  const button = $("#refreshDashboard");
  button.disabled = true;
  try {
    const state = await apiRequest("/state");
    warehouse = state.warehouse;
    cars = state.cars || [];
    shipments = state.shipments || [];
    invoices = state.invoices || [];
    cellStatuses = state.cellStatuses || [];
    $("#statusLegend").innerHTML = cellStatuses.map((status) => `<span><i style="background:${escapeHtml(status.color)}"></i>${escapeHtml(status.label)}</span>`).join("");
    $("#warehouseName").textContent = warehouse.name || "Управление складом автомобилей";
    $("#warehouseLocation").textContent = warehouse.location || "Складской комплекс";
    renderSummary(state.dashboard);
    renderFilters();
    renderMap();
    renderLogistics();
    $("#lastUpdate").textContent = `Обновлено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    $("#warehouseGrid").innerHTML = `<div class="empty-state">Не удалось загрузить карту. ${escapeHtml(error.message)}</div>`;
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
      showMessage(await handler());
      form.reset();
      await loadData();
    } catch (error) { showMessage(error.message, true); }
    finally { submit.disabled = false; }
  });
}

bindForm("#carForm", async () => {
  const payload = { vin: $("#vinInput").value.trim(), model: $("#modelInput").value.trim() };
  if ($("#cellIdInput").value.trim()) payload.cellId = $("#cellIdInput").value.trim();
  const car = await apiRequest("/car", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return `Автомобиль ${car.vin} принят в ячейку ${car.cellId}`;
});

bindForm("#replaceCarForm", async () => {
  const car = await apiRequest(`/car/${encodeURIComponent($("#replaceVinInput").value.trim())}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cellId: $("#replaceCellIdInput").value.trim() }) });
  return `Автомобиль ${car.vin} перемещён в ${car.cellId}`;
});

bindForm("#reserveCarForm", async () => {
  const car = await apiRequest(`/reserve/${encodeURIComponent($("#reserveVinInput").value.trim())}`, { method: "PATCH" });
  return `Автомобиль ${car.vin} поставлен в резерв`;
});

bindForm("#unreserveCarForm", async () => {
  const car = await apiRequest(`/unreserve/${encodeURIComponent($("#unreserveVinInput").value.trim())}`);
  return `Резерв автомобиля ${car.vin} снят`;
});

bindForm("#deleteCarForm", async () => {
  const vin = $("#deleteVinInput").value.trim();
  if (!window.confirm(`Удалить автомобиль ${vin} со склада?`)) throw new Error("Удаление отменено");
  await apiRequest(`/car/${encodeURIComponent(vin)}`, { method: "DELETE" });
  return `Автомобиль ${vin} удалён со склада`;
});

bindForm("#batchForm", async () => {
  const lines = $("#batchInput").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const batchCars = lines.map((line, index) => {
    const [vin, model, cellId] = line.split(";").map((part) => part.trim());
    if (!vin || !model) throw new Error(`Строка ${index + 1}: укажите VIN и модель через точку с запятой`);
    return { vin, model, ...(cellId ? { cellId } : {}) };
  });
  const created = await apiRequest("/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cars: batchCars }) });
  return `Принято автомобилей: ${created.length}`;
});

bindForm("#shipmentForm", async () => {
  const vins = $("#shipmentVinsInput").value.split(/[\s,;]+/).map((vin) => vin.trim()).filter(Boolean);
  if (!vins.length) throw new Error("Добавьте хотя бы один VIN");
  const shipment = await apiRequest("/ship", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealer: $("#dealerInput").value.trim(), vins }) });
  return `Заявка №${shipment.id} создана`;
});

$("#findCarForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const vin = $("#findVinInput").value.trim();
  const model = $("#findModelInput").value.trim();
  if (!vin && !model) return showMessage("Укажите VIN или модель", true);
  try {
    const result = vin ? [await apiRequest(`/car/${encodeURIComponent(vin)}`)] : await apiRequest(`/cars/${encodeURIComponent(model)}`);
    showMessage(result.map((car) => `${car.model} · VIN ${car.vin} · ячейка ${car.cellId}`).join("; "));
    $("#mapSearch").value = vin || model;
    renderMap();
  } catch (error) { showMessage(error.message, true); }
});

$("#fifoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const car = await apiRequest(`/fifo/${encodeURIComponent($("#fifoModelInput").value.trim())}`);
    showMessage(`Первый по FIFO: ${car.model} · VIN ${car.vin} · ячейка ${car.cellId}`);
  } catch (error) { showMessage(error.message, true); }
});

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

$("#refreshDashboard").addEventListener("click", loadData);
$("#exportKpiButton").addEventListener("click", exportKpi);
$("#exportButton").addEventListener("click", () => { window.location.href = `${API}/csv?token=${encodeURIComponent(authToken)}`; });
$("#mapSearch").addEventListener("input", renderMap);
$("#zoneFilters").addEventListener("click", (event) => { const button = event.target.closest("[data-zone]"); if (!button) return; activeZone = button.dataset.zone; renderFilters(); renderMap(); });
$("#warehouseGrid").addEventListener("click", (event) => { const cell = event.target.closest("[data-cell]"); if (cell) openCell(cell.dataset.cell); });
$("#shipmentList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ship-id]");
  if (!button || !window.confirm(`Подтвердить отгрузку по заявке №${button.dataset.shipId}? Автомобили будут удалены со склада.`)) return;
  button.disabled = true;
  try { await apiRequest(`/ship/${button.dataset.shipId}`, { method: "DELETE" }); showMessage(`Заявка №${button.dataset.shipId} отгружена, накладная сформирована`); await loadData(); }
  catch (error) { showMessage(error.message, true); button.disabled = false; }
});

$("#dialogContent").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-dialog-move]");
  if (!form) return;
  event.preventDefault();
  const vin = form.dataset.vin;
  const cellId = new FormData(form).get("cellId").trim();
  runDialogAction(() => apiRequest(`/car/${encodeURIComponent(vin)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cellId }) }), `Автомобиль ${vin} перемещён в ячейку ${cellId}`);
});

$("#dialogContent").addEventListener("click", (event) => {
  const reserveButton = event.target.closest("[data-dialog-reserve]");
  if (reserveButton) {
    const vin = reserveButton.dataset.vin;
    const reserved = reserveButton.dataset.reserved === "true";
    runDialogAction(() => apiRequest(`/${reserved ? "unreserve" : "reserve"}/${encodeURIComponent(vin)}`, reserved ? {} : { method: "PATCH" }), reserved ? `Резерв автомобиля ${vin} снят` : `Автомобиль ${vin} поставлен в резерв`);
    return;
  }
  const deleteButton = event.target.closest("[data-dialog-delete]");
  if (deleteButton && window.confirm(`Удалить автомобиль ${deleteButton.dataset.vin} со склада?`)) {
    const vin = deleteButton.dataset.vin;
    runDialogAction(() => apiRequest(`/car/${encodeURIComponent(vin)}`, { method: "DELETE" }), `Автомобиль ${vin} удалён со склада`);
  }
});

$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => { $("#cellDialog").hidden = true; }));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") $("#cellDialog").hidden = true; });
$$('.operation-tab').forEach((tab) => tab.addEventListener("click", () => {
  $$('.operation-tab').forEach((item) => item.classList.toggle("active", item === tab));
  $$('.operation-form').forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
}));
$$('.nav__item').forEach((item) => item.addEventListener("click", () => {
  $$('.nav__item').forEach((link) => link.classList.toggle("active", link === item));
}));

$("#authSwitch").addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  const registering = authMode === "register";
  $("#authHint").textContent = registering ? "Создайте аккаунт для работы со складом" : "Войдите, чтобы продолжить работу со складом";
  $("#authSubmit").textContent = registering ? "Зарегистрироваться" : "Войти";
  $("#authSwitch").textContent = registering ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
  $("#authPassword").autocomplete = registering ? "new-password" : "current-password";
  $("#authError").textContent = "";
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#authSubmit");
  submit.disabled = true;
  $("#authError").textContent = "";
  try {
    const result = await apiRequest(`/auth/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#authUsername").value.trim(), password: $("#authPassword").value }) });
    authToken = result.token;
    authUsername = result.username;
    localStorage.setItem("wmsToken", authToken);
    localStorage.setItem("wmsUsername", authUsername);
    $("#authForm").reset();
    showApp();
    await loadData();
  } catch (error) { $("#authError").textContent = error.message; }
  finally { submit.disabled = false; }
});

$("#logoutButton").addEventListener("click", async () => {
  try { await apiRequest("/auth/logout", { method: "POST" }); } catch (_) {}
  authToken = "";
  authUsername = "";
  localStorage.removeItem("wmsToken");
  localStorage.removeItem("wmsUsername");
  showAuth();
});

if (authToken) { showApp(); loadData(); } else { showAuth(); }
