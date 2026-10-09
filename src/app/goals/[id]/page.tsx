import { Suspense } from "react";

import { PagePlaceholder } from "@/components/page-placeholder";

async function GoalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title="รายละเอียดเป้าหมาย"
      description={`รายละเอียดเป้าหมายและผลแข่งของ ${id}`}
    />
  );
}

export default function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <PagePlaceholder
          title="รายละเอียดเป้าหมาย"
          description="กำลังโหลดรายละเอียด…"
        />
      }
    >
      <GoalDetail params={params} />
    </Suspense>
  );
}
