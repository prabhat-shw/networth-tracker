import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "NetWorth",
  description: "Zero-knowledge household net-worth tracker",
};

// Explicit props rather than Next's generated `LayoutProps`, so `tsc --noEmit` passes on a
// clean checkout without first running `next build` to emit .next/types.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
