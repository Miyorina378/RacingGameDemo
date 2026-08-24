import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Autodrive Motorsport",
  description: "Experience kilometer-scale cyberpunk racing. Tune 13 custom performance parts, build your own tracks with our interactive editor, and compete with high-octane AI opponents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} h-full antialiased bg-[#09090b] text-white`}
    >
      <body className="min-h-full flex flex-col bg-[#09090b] text-white">{children}</body>
    </html>
  );
}
