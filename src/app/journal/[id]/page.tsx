import { Suspense } from "react";

import { PagePlaceholder } from "@/components/page-placeholder";

async function JournalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title="รายละเอียดผลซ้อม"
      description={`รายละเอียดและผลเทียบแผนของเซสชัน ${id}`}
    />
  );
}

export default function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <PagePlaceholder
          title="รายละเอียดผลซ้อม"
          description="กำลังโหลดรายละเอียด…"
        />
      }
    >
      <JournalDetail params={params} />
    </Suspense>
  );
}
