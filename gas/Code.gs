const SCRIPT_VERSION = '1.0-training';
const SCHEMA_VERSION = 'erp-attribute-v1';

// KHAI BÁO CỘT - TAB MATERIALS (A-U)
const COL_ID = 0, COL_CODE = 1, COL_NAME = 2, COL_CAT = 3, COL_UNIT = 4;
const COL_MAT_TYPE = 5, COL_GRADE = 6, COL_STANDARD = 7, COL_DIMENSIONS = 8;
const COL_TECH_SPEC = 9, COL_NOTES = 10, COL_STATUS = 11, COL_ORIGIN_CODE = 12;
const COL_ORIGIN_SRC = 13, COL_CREATED_AT = 14, COL_UPDATED_AT = 15;
const COL_CREATED_BY = 16, COL_UPDATED_BY = 17, COL_REVISION = 18;
const COL_REQ_ID = 19, COL_ATTR_JSON = 20;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};

    if (action === 'training.status') {
      return success({ enabled: true, mode: 'training', canCreate: true, attributeSchemaVersion: SCHEMA_VERSION });
    }
    if (action === 'training.list') return success(listMaterials());
    if (action === 'training.create') return createMaterial(payload);

    return error('UNKNOWN_ACTION', 'Action không hợp lệ');
  } catch (err) {
    return error('SERVER_ERROR', err.message);
  }
}

function doPostOptions(e) { return success({}); } // Fix CORS preflight nếu có

// -- CÁC HÀM XỬ LÝ CHÍNH --
function listMaterials() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("MATERIALS");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { materials: [], count: 0 };
  
  const headers = data[0];
  const rows = data.slice(1);
  const materials = rows.map(r => ({
    id: r[COL_ID], code: r[COL_CODE], name: r[COL_NAME],
    categoryId: r[COL_CAT], unit: r[COL_UNIT], materialType: r[COL_MAT_TYPE],
    status: r[COL_STATUS], createdAt: r[COL_CREATED_AT],
    requestId: r[COL_REQ_ID], attributesJson: r[COL_ATTR_JSON]
  })).filter(m => m.code !== "");
  
  return { materials: materials, count: materials.length };
}

function createMaterial(payload) {
  const { actorName, requestId, material } = payload;
  if (!requestId || !material || !material.categoryId) throw new Error("Thiếu dữ liệu bắt buộc");

  // KHÓA SERVER (CHỐNG RACE CONDITION 10 WEBSITE CÙNG GỬI)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return error('SYSTEM_BUSY', 'Hệ thống đang xử lý yêu cầu khác, vui lòng thử lại sau.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const matSheet = ss.getSheetByName("MATERIALS");
    const numSheet = ss.getSheetByName("NUMBER_RANGES");
    const logSheet = ss.getSheetByName("AUDIT_LOG");
    
    const matData = matSheet.getDataRange().getValues();
    
    // 1. Kiểm tra Idempotent (Chống gửi 2 lần cùng requestId)
    if (matData.length > 1) {
      const existingReq = matData.slice(1).find(r => r[COL_REQ_ID] === requestId);
      if (existingReq) {
        return success({ material: { code: existingReq[COL_CODE] }, idempotentReplay: true });
      }
    }

    // 2. Logic kiểm tra Trùng (Duplicate Check tại Server)
    const newAttrString = JSON.stringify(material.attributes || {});
    if (matData.length > 1) {
      const duplicate = matData.slice(1).find(r => 
        r[COL_CAT] === material.categoryId && 
        r[COL_ATTR_JSON] === newAttrString
      );
      if (duplicate) {
        return error('DUPLICATE_MATERIAL', `Vật tư trùng lặp kỹ thuật với mã: ${duplicate[COL_CODE]}`);
      }
    }

    // 3. Lấy và Cấp Mã Tự Động
    const numRange = numSheet.getRange("A2:F2").getValues()[0];
    let lastNumber = parseInt(numRange[3]) || 0;
    let nextNum = lastNumber + 1;
    let newCode = "A" + ("000000" + nextNum).slice(-6); // e.g. A000001
    
    // 4. Sinh tên vật tư cơ bản phía server
    const newName = `Vật tư ${material.categoryId} - Tự sinh phía Server`;
    
    // 5. Ghi vào Sheet MATERIALS
    const newId = Utilities.getUuid();
    const now = new Date().toISOString();
    const newRow = Array(21).fill("");
    newRow[COL_ID] = newId;
    newRow[COL_CODE] = newCode;
    newRow[COL_NAME] = newName; 
    newRow[COL_CAT] = material.categoryId;
    newRow[COL_MAT_TYPE] = material.materialType;
    newRow[COL_NOTES] = material.notes;
    newRow[COL_STATUS] = "ACTIVE";
    newRow[COL_CREATED_AT] = now;
    newRow[COL_UPDATED_AT] = now;
    newRow[COL_CREATED_BY] = actorName;
    newRow[COL_REVISION] = 1;
    newRow[COL_REQ_ID] = requestId;
    newRow[COL_ATTR_JSON] = newAttrString;

    matSheet.appendRow(newRow);

    // 6. Cập nhật dải số
    numSheet.getRange(2, 4).setValue(nextNum);
    numSheet.getRange(2, 5).setValue(newCode);

    // 7. Ghi Audit Log
    logSheet.appendRow([Utilities.getUuid(), now, actorName, "CREATE", newCode, requestId, "", newAttrString, "SUCCESS"]);

    return success({ material: { id: newId, code: newCode }, idempotentReplay: false });
  } catch (err) {
    return error('INTERNAL_ERROR', err.message);
  } finally {
    // 8. GIẢI PHÓNG KHÓA
    lock.releaseLock();
  }
}

// Helpers
function success(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data, version: SCRIPT_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

function error(code, message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: { code: code, message: message } }))
    .setMimeType(ContentService.MimeType.JSON);
}
