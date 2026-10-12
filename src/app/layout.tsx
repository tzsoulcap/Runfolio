import type { Metadata } from "next";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import "./globals.css";
import { BottomNav, Header, Sidebar } from "@/components/nav";
import { getSessionUserId } from "@/lib/auth/session";
import { getOwnProfile } from "@/lib/services/profile";

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
  title: "Runfolio",
  description: "สมุดซ้อมวิ่งส่วนตัว: วางแผน บันทึก และดูความต่อเนื่อง",
};

async function AvatarHeader() {
  await connection();
  const userId = await getSessionUserId();
  const profile = userId ? await getOwnProfile(userId) : null;
  const name = profile?.displayName?.trim() ?? "";
  return <Header initial={name === "" ? null : name[0]!.toUpperCase()} />;
}

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
          <Suspense fallback={<Header initial={null} />}>
            <AvatarHeader />
          </Suspense>
          <main className="mx-auto w-full max-w-[1180px] px-4 pt-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 lg:pt-6 lg:pb-12">
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
