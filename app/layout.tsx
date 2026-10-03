import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ReviewFlow",
  description: "Turn genuine customer feedback into polished Google review drafts."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}