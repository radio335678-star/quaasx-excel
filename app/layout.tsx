import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Q108 Sheets — AI Spreadsheet & Data Studio | Quaasx 108',
  description: 'Q108 Sheets by Quaasx 108 — AI Spreadsheet & Data Studio with WebAssembly calculation engine, zero-cloud data privacy, and intelligent formula assistance.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <script src="https://cdn.jsdelivr.net/npm/apexcharts" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
