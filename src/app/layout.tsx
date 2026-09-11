import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientRecovery } from "@/components/ClientRecovery";
import { BRAND } from "@/lib/brand";
import { STALE_ASSET_RECOVERY_SCRIPT } from "@/lib/stale-asset-recovery-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — orders, vehicles, and delivery management`,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full font-sans">
        <script
          dangerouslySetInnerHTML={{ __html: STALE_ASSET_RECOVERY_SCRIPT }}
        />
        <ClientRecovery />
        {children}
      </body>
    </html>
  );
}
