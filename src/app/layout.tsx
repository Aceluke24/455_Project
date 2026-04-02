import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basic Order App",
  description: "Simple class app to insert orders into Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="top-nav">
          <nav>
            <Link href="/">Place order</Link>
            <Link href="/admin">Fraud review</Link>
            <Link href="/admin/history">Order history</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
