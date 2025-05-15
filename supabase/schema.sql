-- TraceMate Database Schema

-- 1. Users table
CREATE TABLE public.users (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text         UNIQUE NOT NULL,
  password_hash  text         NOT NULL,
  role           text         NOT NULL DEFAULT 'free',
  created_at     timestamp    NOT NULL DEFAULT now()
);

-- 2. Usage sessions
CREATE TABLE public.usage_sessions (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at      timestamp NOT NULL DEFAULT now(),
  duration_secs   integer   NOT NULL,
  completed       boolean   NOT NULL DEFAULT false
);
CREATE INDEX ON public.usage_sessions (user_id, date_trunc('day', started_at));

-- 3. Payments
CREATE TABLE public.payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method          text        NOT NULL,
  reference       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  created_at      timestamp   NOT NULL DEFAULT now(),
  updated_at      timestamp   NOT NULL DEFAULT now()
);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Usage sessions policies
CREATE POLICY "Users can insert their own usage sessions" ON public.usage_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own usage sessions" ON public.usage_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage sessions" ON public.usage_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Payments policies
CREATE POLICY "Users can view their own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update payments
CREATE POLICY "Service role can manage all payments" ON public.payments
  USING (auth.role() = 'service_role');
