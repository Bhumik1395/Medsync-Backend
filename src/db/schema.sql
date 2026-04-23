create extension if not exists pgcrypto;

create table if not exists public.users (
  user_id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('patient', 'hospital', 'path_lab', 'insurance', 'admin')),
  email text not null unique,
  name text not null,
  password_hash text not null,
  abha_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospitals (
  hospital_id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users (user_id) on delete set null,
  name text not null,
  location text not null default 'Not set',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  patient_id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (user_id) on delete cascade,
  hospital_id uuid references public.hospitals (hospital_id) on delete set null,
  name text not null,
  abha_number text not null unique,
  age integer not null default 0,
  blood_group text not null default 'Unknown',
  sex text not null default 'Unspecified',
  phone text not null default '',
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  appointment_id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (patient_id) on delete cascade,
  appointment_date date not null,
  department text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (patient_id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  report_id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (patient_id) on delete cascade,
  hospital_id uuid references public.hospitals (hospital_id) on delete set null,
  uploaded_by_user_id uuid references public.users (user_id) on delete set null,
  doctor_name text not null,
  type text not null,
  file_name text not null,
  findings text not null default '',
  ai_summary text not null default '',
  shared_with jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (report_id) on delete cascade,
  patient_id uuid not null references public.patients (patient_id) on delete cascade,
  hospital_id uuid references public.hospitals (hospital_id) on delete set null,
  forwarded_by_user_id uuid references public.users (user_id) on delete set null,
  insurance_user_id uuid references public.users (user_id) on delete set null,
  policy_number text not null,
  status text not null default 'Received',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  log_id uuid primary key default gen_random_uuid(),
  action text not null,
  actor text not null,
  details text not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.hospitals enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.insurance_submissions enable row level security;
alter table public.audit_logs enable row level security;
