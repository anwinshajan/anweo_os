import { qrPath } from "@/lib/qr";

// A scannable QR code, drawn as SVG with a quiet zone around it.
export default function QrSvg({ text, size = 180, className = "" }: { text: string; size?: number; className?: string }) {
  const { d, size: n } = qrPath(text);
  return (
    <svg width={size} height={size} viewBox={`-4 -4 ${n + 8} ${n + 8}`} shapeRendering="crispEdges" role="img" aria-label="QR code" className={className}>
      <rect x="-4" y="-4" width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#141413" />
    </svg>
  );
}
