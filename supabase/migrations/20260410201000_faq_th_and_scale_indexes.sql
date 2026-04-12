-- Add Thai FAQ fields + high-scale indexes for search/queue processing

create extension if not exists pg_trgm;
alter table public.support_faqs
  add column if not exists question_th text,
  add column if not exists answer_th text;
update public.support_faqs
set
  question_th = case
    when question = 'How can I recover my account?' then 'กู้คืนบัญชีต้องทำอย่างไร?'
    when question = 'How do I keep my vault secure?' then 'ทำอย่างไรให้คลังรหัสปลอดภัย?'
    when question = 'How does Team Keys sharing work?' then 'การแชร์รหัสแบบ Team Keys ทำงานอย่างไร?'
    else question_th
  end,
  answer_th = case
    when question = 'How can I recover my account?' then 'กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ ยืนยัน OTP แล้วตั้งรหัสผ่านและ PIN ใหม่'
    when question = 'How do I keep my vault secure?' then 'เปิดใช้ PIN Lock ตั้งรหัสผ่านที่คาดเดายาก และตรวจสอบอุปกรณ์ที่เชื่อมต่อเป็นประจำ'
    when question = 'How does Team Keys sharing work?' then 'สร้าง Team Room เชิญสมาชิก แล้วแชร์รายการรหัสที่ต้องการเข้าไปในห้องนั้น'
    else answer_th
  end
where question in (
  'How can I recover my account?',
  'How do I keep my vault secure?',
  'How does Team Keys sharing work?'
);
create index if not exists idx_notes_search_trgm
  on public.notes
  using gin ((lower(coalesce(title, '') || ' ' || coalesce(content, ''))) gin_trgm_ops);
create index if not exists idx_push_queue_pending_schedule_priority
  on public.push_notification_queue (status, scheduled_at asc, priority desc, id asc);
