import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OBSIDIAN TERMINAL // RWA RISK DESK",
  description:
    "Autonomous Real World Assets (RWA) Intelligence, 3D Risk Topology, Alerting & Stress-Testing Workstation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full w-full bg-[#08090C] text-[#E6EAF2] antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
