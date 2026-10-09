import type { Metadata } from "next";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import { BottomNav, Header, Sidebar } from "@/components/nav";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Running Journal",
  description: "สมุดซ้อมวิ่งส่วนตัว: วางแผน บันทึก และดูความต่อเนื่อง",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="th"
      className={`${geist.variable} ${notoThai.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        <div className="min-h-dvh lg:pl-60">
          <Header />
          <main className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-28 sm:px-5 lg:pt-6 lg:pb-12">
            {children}
          </main>
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
