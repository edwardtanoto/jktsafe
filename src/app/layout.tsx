import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Oxanium } from "next/font/google";
import { Analytics } from '@vercel/analytics/react';
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const oxanium = Oxanium({
  variable: "--font-oxanium",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Safe Indonesia",
  description: "Stay safe with state-of-the-art OSINT. Contact us if you want to contribute.",
  icons: {
    icon: [
      { url: "/indo.ico", sizes: "any" },
      { url: "/safe.png", type: "image/png", sizes: "32x32" }
    ],
    shortcut: "/indo.ico",
    apple: "/safe.png",
  },
  openGraph: {
    title: "Safe Indonesia",
    description: "Stay safe with state-of-the-art OSINT. Contact us if you want to contribute.",
    url: "https://safe.100ai.id",
    siteName: "Safe Indonesia",
    images: [
      {
        url: "/safe.png",
        width: 1200,
        height: 630,
        alt: "Safe Indonesia - Real-time incident monitoring and reporting system",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Safe Indonesia",
    description: "Stay safe with state-of-the-art OSINT. Contact us if you want to contribute.",
    images: ["/safe.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${oxanium.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
