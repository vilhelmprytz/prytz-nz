import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-title",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vilhelm's trip",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
