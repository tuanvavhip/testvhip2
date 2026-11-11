const BarcodeEngine = {
  render(elementId, text) {
    if (!text) return;
    try {
      JsBarcode(`#${elementId}`, text, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 60,
        displayValue: true
      });
    } catch(e) {
      console.error("Barcode Error", e);
    }
  },

  downloadSVG(elementId, filename) {
    const svg = document.getElementById(elementId);
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};
