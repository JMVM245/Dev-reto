import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevSync Empleos · LinkedIn demo y Buk ATS",
  description: "Panel de empleos de demostración conectado al ATS Buk de prueba.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
