import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rainier Lab",
  description: "Scenario lab for operations simulation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
