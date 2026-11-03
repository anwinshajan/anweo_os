import QRCode from "qrcode";

// A QR code as an SVG path (one square per dark module) plus its size, so the web page and the PDF can both draw it.
export function qrPath(text: string): { d: string; size: number } {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, data = q.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
  return { d, size: n };
}
