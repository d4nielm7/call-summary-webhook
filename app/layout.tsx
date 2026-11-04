import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

const geist = localFont({ src: "./fonts/geist-latin.woff2", variable: "--font-geist", weight: "400 600", display: "swap" });
const geistMono = localFont({ src: "./fonts/geist-mono-latin.woff2", variable: "--font-geist-mono", weight: "400 600", display: "swap" });

export const metadata: Metadata = {
  title: "Call Desk · AI receptionist dashboard",
  robots: { index: false, follow: false },
};

const setTheme = `try{document.documentElement.dataset.theme=localStorage.getItem("calldesk.theme")==="light"?"light":"dark"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: setTheme }} />
        <div className="backdrop" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
