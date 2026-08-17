import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DenialDefender — Evidence-Grounded Denial Appeal Operations",
  description: "8-agent ADK fleet that turns medical insurance claim denials into evidence-backed appeal letters. Evidence-Grounded, Human-Governed Denial-Appeal Operations.",
  keywords: ["DenialDefender", "medical insurance", "denial appeal", "ADK", "AI agents", "evidence-based", "HITL"],
  authors: [{ name: "DenialDefender Team" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "DenialDefender — Evidence-Grounded Denial Appeal Operations",
    description: "8-agent ADK fleet that turns medical insurance claim denials into evidence-backed appeal letters",
    url: "https://denialdefender.app",
    siteName: "DenialDefender",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DenialDefender — Evidence-Grounded Denial Appeal Operations",
    description: "8-agent ADK fleet that turns medical insurance claim denials into evidence-backed appeal letters",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
