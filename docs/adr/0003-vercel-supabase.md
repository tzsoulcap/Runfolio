# Host v1 on Vercel with Supabase (Postgres + Auth)

v1 เป็น multi-user จึงต้องการ managed infra แบบ zero-ops: Vercel รัน Next.js ส่วน Supabase เป็นทั้ง Postgres (Drizzle ผ่าน connection string + pooler) และ Auth (Google-only) vendor เดียวจบ ไม่ใช้ RLS ใน v1 โดย ownership ตรวจฝั่ง service ตามสเปก Self-host/docker-compose เหลือไว้สำหรับ dev local
