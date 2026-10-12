import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="app-page py-8">
      <div className="rounded-[20px] bg-[#f6f4ef] p-6 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-lime-soft">
          <MapPin className="size-7 text-forest" aria-hidden />
        </span>
        <p className="mt-4 text-xs font-medium text-muted">404</p>
        <h1 className="page-title mt-2">ไม่พบหน้านี้</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          หน้านี้อาจถูกลบหรือไม่มีอยู่แล้ว
          <br />
          กลับไปดูแผนการซ้อมวันนี้ได้เลย
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-button bg-forest px-5 text-sm font-medium text-paper"
        >
          <ArrowLeft className="size-4" aria-hidden />
          กลับหน้าวันนี้
        </Link>
      </div>
    </div>
  );
}
