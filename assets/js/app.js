let config = {};
let materialsList = [];
let currentAttributes = {};

// Khởi tạo
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  await loadConfig();
  await checkServerStatus();
});

// UI Toasts
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  toast.style.borderLeftColor = type === 'error' ? 'var(--error)' : 'var(--primary)';
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Chuyển Tab
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      e.target.classList.add("active");
      document.getElementById(`view-${e.target.dataset.view}`).classList.add("active");
    });
  });

  document.getElementById("btn-sync").addEventListener("click", syncData);
  document.querySelector(".close-modal").addEventListener("click", () => {
    document.getElementById("detail-modal").style.display = "none";
  });
}

async function loadConfig() {
  const res = await fetch("assets/data/config.json");
  config = await res.json();
  
  const catSelect = document.getElementById("select-category");
  config.categories.forEach(c => catSelect.add(new Option(c.name, c.id)));
  
  const matSelect = document.getElementById("select-material-type");
  config.materialTypes.forEach(m => matSelect.add(new Option(m.name, m.id)));

  catSelect.addEventListener("change", onCategoryChange);
  document.getElementById("select-subtype").addEventListener("change", renderDynamicFields);
}

async function checkServerStatus() {
  const badge = document.getElementById("sync-status");
  try {
    const status = await CloudBridge.invoke('training.status');
    if (status.enabled && status.attributeSchemaVersion === config.erpFormVersion) {
      badge.textContent = "Đã kết nối GAS";
      badge.className = "badge connected";
      document.getElementById("dash-gas-status").textContent = "Online (Chế độ đào tạo)";
      await syncData();
    } else {
      throw new Error("Phiên bản Schema không khớp hoặc Server đóng.");
    }
  } catch(e) {
    badge.textContent = "Lỗi kết nối";
    badge.className = "badge error";
    document.getElementById("dash-gas-status").textContent = `Offline: ${e.message}`;
    showToast(e.message, "error");
  }
}

async function syncData() {
  try {
    const data = await CloudBridge.invoke('training.list');
    materialsList = data.materials;
    document.getElementById("dash-total").innerText = data.count;
    renderTable(materialsList);
    showToast("Đồng bộ dữ liệu thành công");
  } catch(e) {
    showToast("Lỗi đồng bộ: " + e.message, "error");
  }
}

function onCategoryChange(e) {
  const catId = e.target.value;
  const subSelect = document.getElementById("select-subtype");
  subSelect.innerHTML = '<option value="">-- Chọn chủng loại --</option>';
  
  if (catId && config.formSchemas[catId]) {
    config.formSchemas[catId].forEach(sub => subSelect.add(new Option(sub.label, sub.id)));
    subSelect.disabled = false;
  } else {
    subSelect.disabled = true;
  }
  document.getElementById("dynamic-fields-section").style.display = "none";
}

function renderDynamicFields() {
  const catId = document.getElementById("select-category").value;
  const subId = document.getElementById("select-subtype").value;
  const container = document.getElementById("dynamic-fields");
  container.innerHTML = "";
  currentAttributes = {};
  
  if (!subId) {
    document.getElementById("dynamic-fields-section").style.display = "none";
    return;
  }

  const schema = config.formSchemas[catId].find(s => s.id === subId);
  document.getElementById("select-material-type").value = schema.defaultMaterialType;

  schema.fields.forEach(field => {
    const div = document.createElement("div");
    div.className = "form-group";
    let inputHtml = `<label>${field.label} ${field.required ? '*' : ''} ${field.unit ? '('+field.unit+')' : ''}</label>`;
    
    if (field.kind === 'select' || field.kind === 'suggest') {
      inputHtml += `<select id="attr-${field.id}" ${field.required ? 'required' : ''}>
        <option value="">-- Chọn --</option>
        ${field.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`;
    } else {
      inputHtml += `<input type="${field.kind === 'number' ? 'number' : 'text'}" id="attr-${field.id}" step="0.001" min="0" ${field.required ? 'required' : ''}>`;
    }
    
    div.innerHTML = inputHtml;
    container.appendChild(div);

    // Bắt sự kiện thay đổi để check trùng
    const inputEl = container.querySelector(`#attr-${field.id}`);
    inputEl.addEventListener("input", (e) => {
      currentAttributes[field.id] = e.target.value;
      runDuplicateCheck(catId, subId);
    });
  });

  document.getElementById("dynamic-fields-section").style.display = "block";
  document.getElementById("btn-save").onclick = submitMaterial;
  runDuplicateCheck(catId, subId); // check rỗng
}

function runDuplicateCheck(catId, subId) {
  // Sinh tên
  const generatedName = MaterialRules.generateName(catId, subId, currentAttributes, config);
  document.getElementById("preview-name").value = generatedName;

  // Lấy list schema fields
  const schema = config.formSchemas[catId].find(s => s.id === subId);
  const isFormComplete = schema.fields.every(f => !f.required || currentAttributes[f.id]);
  
  const btnSave = document.getElementById("btn-save");
  const warnBox = document.getElementById("duplicate-warning");
  const dupMsg = document.getElementById("dup-message");
  
  if (!isFormComplete) {
    warnBox.style.display = "none";
    btnSave.disabled = true;
    return;
  }

  // So sánh IdentityKey với danh sách hiện tại (Frontend Filter)
  const currentKey = MaterialRules.generateIdentityKey(catId, subId, currentAttributes, config);
  const duplicate = materialsList.find(m => 
    m.attributesJson && 
    MaterialRules.generateIdentityKey(m.categoryId, m.subtypeId, JSON.parse(m.attributesJson), config) === currentKey
  );

  if (duplicate) {
    warnBox.style.display = "block";
    warnBox.className = "alert alert-error";
    warnBox.style.borderColor = "var(--error)";
    dupMsg.innerHTML = `Vật tư đã tồn tại! Mã: <strong>${duplicate.code}</strong>. Không thể lưu.`;
    btnSave.disabled = true;
  } else {
    warnBox.style.display = "block";
    warnBox.className = "alert alert-success";
    warnBox.style.borderColor = "var(--success)";
    dupMsg.innerHTML = "Không phát hiện trùng. Có thể cấp mã.";
    btnSave.disabled = false;
  }
}

async function submitMaterial() {
  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  btn.innerText = "Đang cấp mã...";

  const payload = {
    actorName: "Hoc vien AI", // Demo
    requestId: crypto.randomUUID(), // Khóa chống lặp (Idempotent)
    material: {
      categoryId: document.getElementById("select-category").value,
      subtypeId: document.getElementById("select-subtype").value,
      materialType: document.getElementById("select-material-type").value,
      attributes: currentAttributes,
      notes: document.getElementById("input-notes").value
    }
  };

  try {
    const res = await CloudBridge.invoke('training.create', payload);
    document.getElementById("preview-code").value = res.material.code;
    showToast(`Đã cấp mã thành công: ${res.material.code}`, "success");
    await syncData(); // Tải lại danh sách
    
    // Mở popup xem barcode luôn
    setTimeout(() => openDetail(res.material.code), 1000);
  } catch(e) {
    showToast("Lỗi cấp mã: " + e.message, "error");
  } finally {
    btn.innerText = "Gửi yêu cầu cấp mã";
    // Form sẽ được disable logic qua checkDuplicate
  }
}

function renderTable(data) {
  const tbody = document.querySelector("#material-table tbody");
  tbody.innerHTML = "";
  data.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${m.code}</strong></td>
      <td>${m.name}</td>
      <td>${config.categories.find(c => c.id === m.categoryId)?.name || m.categoryId}</td>
      <td>${m.unit}</td>
      <td>${new Date(m.createdAt).toLocaleDateString('vi-VN')}</td>
    `;
    tr.onclick = () => openDetail(m.code);
    tbody.appendChild(tr);
  });
}

function openDetail(code) {
  const m = materialsList.find(x => x.code === code);
  if(!m) return;
  const body = document.getElementById("detail-body");
  let attrHtml = "";
  if(m.attributesJson) {
    const attrs = JSON.parse(m.attributesJson);
    attrHtml = Object.entries(attrs).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('');
  }
  
  body.innerHTML = `
    <p><strong>Mã ERP:</strong> ${m.code}</p>
    <p><strong>Tên vật tư:</strong> ${m.name}</p>
    <p><strong>Loại ERP:</strong> ${m.materialType}</p>
    <p><strong>Thông số:</strong> <ul>${attrHtml}</ul></p>
  `;
  
  BarcodeEngine.render("barcode", m.code);
  document.getElementById("btn-download-barcode").onclick = () => BarcodeEngine.downloadSVG("barcode", m.code);
  document.getElementById("detail-modal").style.display = "block";
}
