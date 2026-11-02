import "./globals.css";
import Toaster from "@/components/Toaster";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Anweo", template: "%s · Anweo" },
  description: "Anweo client and team workspace. Everything digital.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Anweo", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { themeColor: "#0E5A44", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}<Toaster /></body>
    </html>
  );
}
