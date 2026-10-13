import { Geist, Geist_Mono } from "next/font/google";
import StoreProvider from "@/store/Provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL("https://febrocket.com"),
  title: "FebRocket | Your Documents, Ready for Every Form",
  description:
    "Upload your documents once. AI extracts and organizes your information to help you fill repetitive online forms faster.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-950">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
