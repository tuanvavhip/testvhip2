// DÁN URL APP SCRIPT ĐÃ DEPLOY VÀO ĐÂY SAU KHI LÀM BƯỚC 8
const GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycby_THAY_BANG_URL_CUA_BAN/exec";

const CloudBridge = {
  async invoke(action, payload = {}) {
    if (!GAS_EXEC_URL || GAS_EXEC_URL.includes("THAY_BANG_URL")) {
      throw new Error("Chưa cấu hình GAS_EXEC_URL.");
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(GAS_EXEC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      const result = await response.json();
      
      if (!result.ok) throw new Error(result.error?.message || "Lỗi máy chủ ẩn");
      return result.data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error("Kết nối quá hạn (Timeout).");
      throw err;
    }
  }
};
