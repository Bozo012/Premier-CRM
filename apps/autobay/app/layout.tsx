import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoBay Lister",
  description: "AI-powered eBay listing generator",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        <div className="mx-auto max-w-lg min-h-screen flex flex-col">
          {children}
        </div>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
