-- Festora v1 domain schema. Additive only: no drops, truncates or data replacement.
-- Keep festival-local opaque IDs as text; global users/festivals retain UUID primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE users
 ADD COLUMN IF NOT EXISTS phone text,
 ADD COLUMN IF NOT EXISTS institution text,
 ADD COLUMN IF NOT EXISTS place text,
 ADD COLUMN IF NOT EXISTS account_locked_at timestamptz,
 ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
 ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE festivals
 ADD COLUMN IF NOT EXISTS institution text,
 ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata',
 ADD COLUMN IF NOT EXISTS public_mode text NOT NULL DEFAULT 'open',
 ADD COLUMN IF NOT EXISTS public_code_hash text,
 ADD COLUMN IF NOT EXISTS registration_closes_on date,
 ADD COLUMN IF NOT EXISTS registration_locked boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS results_locked boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS team_login_locked boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS brand_color text,
 ADD COLUMN IF NOT EXISTS logo_url text,
 ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE festivals ADD CONSTRAINT festivals_public_mode_check
 CHECK (public_mode IN ('open','results','code','closed'));
--> statement-breakpoint
ALTER TABLE operation_log
 ADD COLUMN IF NOT EXISTS festival_seq bigint,
 ADD COLUMN IF NOT EXISTS client_id text,
 ADD COLUMN IF NOT EXISTS operation_type text,
 ADD COLUMN IF NOT EXISTS actor_role text,
 ADD COLUMN IF NOT EXISTS actor_team_id text,
 ADD COLUMN IF NOT EXISTS request_hash text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS operation_log_festival_client_unique
 ON operation_log(festival_id,client_id) WHERE client_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS operation_log_festival_seq_unique
 ON operation_log(festival_id,festival_seq) WHERE festival_seq IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operation_log_festival_created_idx
 ON operation_log(festival_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE festival_counters (
 festival_id uuid PRIMARY KEY REFERENCES festivals(id) ON DELETE CASCADE,
 last_seq bigint NOT NULL DEFAULT 0 CHECK(last_seq>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO festival_counters(festival_id,last_seq)
 SELECT id,0 FROM festivals ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE organiser_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 institution text NOT NULL, phone text, place text,
 signup_source text NOT NULL DEFAULT 'web',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE email_otp_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL,
 code_hash text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('signup','email_change','password_reset')),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 10),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX email_otp_email_created_idx ON email_otp_challenges(lower(email),created_at DESC);
--> statement-breakpoint
CREATE INDEX email_otp_expiry_idx ON email_otp_challenges(expires_at);
--> statement-breakpoint
CREATE TABLE festival_teams (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id), UNIQUE(festival_id,name)
);
--> statement-breakpoint
CREATE TABLE festival_categories (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(festival_id,id), UNIQUE(festival_id,name)
);
--> statement-breakpoint
CREATE TABLE festival_stages (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(festival_id,id), UNIQUE(festival_id,name)
);
--> statement-breakpoint
CREATE TABLE festival_subfestivals (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(festival_id,id), UNIQUE(festival_id,name)
);
--> statement-breakpoint
ALTER TABLE festival_memberships
 ADD COLUMN IF NOT EXISTS team_id text,
 ADD COLUMN IF NOT EXISTS display_name text,
 ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE festival_memberships ADD CONSTRAINT festival_memberships_team_fk
 FOREIGN KEY(festival_id,team_id) REFERENCES festival_teams(festival_id,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS festival_memberships_festival_role_idx
 ON festival_memberships(festival_id,role) WHERE is_active;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS memberships_user_active_idx
 ON festival_memberships(user_id,is_active);
--> statement-breakpoint
CREATE TABLE candidates (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 team_id text NOT NULL, category_id text NOT NULL,
 skills jsonb NOT NULL DEFAULT '[]'::jsonb, photo_url text, legacy_photo_data text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','archived')),
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id),
 FOREIGN KEY(festival_id,team_id) REFERENCES festival_teams(festival_id,id),
 FOREIGN KEY(festival_id,category_id) REFERENCES festival_categories(festival_id,id)
);
--> statement-breakpoint
CREATE INDEX candidates_team_idx ON candidates(festival_id,team_id);
--> statement-breakpoint
CREATE INDEX candidates_category_idx ON candidates(festival_id,category_id);
--> statement-breakpoint
CREATE INDEX candidates_name_idx ON candidates(festival_id,lower(name));
--> statement-breakpoint
CREATE TABLE programmes (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 category_id text NOT NULL, stage_id text NOT NULL, subfestival_id text,
 topics_enabled boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','scored','verified','published','cancelled')),
 result_published_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id),
 FOREIGN KEY(festival_id,category_id) REFERENCES festival_categories(festival_id,id),
 FOREIGN KEY(festival_id,stage_id) REFERENCES festival_stages(festival_id,id),
 FOREIGN KEY(festival_id,subfestival_id) REFERENCES festival_subfestivals(festival_id,id)
);
--> statement-breakpoint
CREATE INDEX programmes_status_idx ON programmes(festival_id,status);
--> statement-breakpoint
CREATE INDEX programmes_stage_idx ON programmes(festival_id,stage_id);
--> statement-breakpoint
CREATE TABLE programme_participants (
 festival_id uuid NOT NULL, programme_id text NOT NULL, candidate_id text NOT NULL,
 topic text CHECK(topic IS NULL OR char_length(topic)<=120),
 sort_order integer NOT NULL DEFAULT 0, enrolled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,programme_id,candidate_id),
 FOREIGN KEY(festival_id,programme_id) REFERENCES programmes(festival_id,id) ON DELETE CASCADE,
 FOREIGN KEY(festival_id,candidate_id) REFERENCES candidates(festival_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX programme_participants_candidate_idx ON programme_participants(festival_id,candidate_id);
--> statement-breakpoint
CREATE TABLE programme_judges (
 festival_id uuid NOT NULL, programme_id text NOT NULL, judge_user_id uuid NOT NULL,
 assigned_by uuid REFERENCES users(id) ON DELETE SET NULL, assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,programme_id,judge_user_id),
 FOREIGN KEY(festival_id,programme_id) REFERENCES programmes(festival_id,id) ON DELETE CASCADE,
 FOREIGN KEY(festival_id,judge_user_id) REFERENCES festival_memberships(festival_id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX programme_judges_user_idx ON programme_judges(festival_id,judge_user_id);
--> statement-breakpoint
CREATE TABLE judge_submissions (
 festival_id uuid NOT NULL, programme_id text NOT NULL, judge_user_id uuid NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(festival_id,programme_id,judge_user_id),
 FOREIGN KEY(festival_id,programme_id,judge_user_id)
  REFERENCES programme_judges(festival_id,programme_id,judge_user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE judge_marks (
 festival_id uuid NOT NULL, programme_id text NOT NULL, judge_user_id uuid NOT NULL,
 candidate_id text NOT NULL, score numeric(5,1) NOT NULL CHECK(score BETWEEN 0 AND 100),
 criteria jsonb NOT NULL DEFAULT '{}'::jsonb, remarks text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,programme_id,judge_user_id,candidate_id),
 FOREIGN KEY(festival_id,programme_id,judge_user_id)
  REFERENCES programme_judges(festival_id,programme_id,judge_user_id) ON DELETE CASCADE,
 FOREIGN KEY(festival_id,programme_id,candidate_id)
  REFERENCES programme_participants(festival_id,programme_id,candidate_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX judge_marks_candidate_idx ON judge_marks(festival_id,programme_id,candidate_id);
--> statement-breakpoint
CREATE TABLE programme_schedule (
 festival_id uuid NOT NULL, programme_id text NOT NULL, stage_id text NOT NULL,
 day_number smallint NOT NULL CHECK(day_number BETWEEN 1 AND 7),
 start_minute smallint NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 duration_minutes smallint CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,programme_id),
 FOREIGN KEY(festival_id,programme_id) REFERENCES programmes(festival_id,id) ON DELETE CASCADE,
 FOREIGN KEY(festival_id,stage_id) REFERENCES festival_stages(festival_id,id)
);
--> statement-breakpoint
CREATE INDEX programme_schedule_time_idx ON programme_schedule(festival_id,stage_id,day_number,start_minute);
--> statement-breakpoint
CREATE TABLE programme_appeals (
 festival_id uuid NOT NULL, id text NOT NULL, programme_id text NOT NULL,
 candidate_id text NOT NULL, team_id text NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
 decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
 decision_note text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
 PRIMARY KEY(festival_id,id),
 FOREIGN KEY(festival_id,programme_id) REFERENCES programmes(festival_id,id) ON DELETE CASCADE,
 FOREIGN KEY(festival_id,candidate_id) REFERENCES candidates(festival_id,id),
 FOREIGN KEY(festival_id,team_id) REFERENCES festival_teams(festival_id,id)
);
--> statement-breakpoint
CREATE INDEX programme_appeals_status_idx ON programme_appeals(festival_id,status);
--> statement-breakpoint
CREATE TABLE festival_announcements (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 300),
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id)
);
--> statement-breakpoint
CREATE TABLE festival_notifications (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 300),
 recipient text NOT NULL DEFAULT 'all', created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 PRIMARY KEY(festival_id,id)
);
--> statement-breakpoint
CREATE TABLE festival_gallery_assets (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, storage_key text, source_url text,
 caption text CHECK(caption IS NULL OR char_length(caption)<=80),
 mime_type text CHECK(mime_type IS NULL OR mime_type IN ('image/jpeg','image/png','image/webp')),
 byte_size bigint CHECK(byte_size IS NULL OR byte_size>=0),
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id), CHECK(storage_key IS NOT NULL OR source_url IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE festival_links (
 festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
 id text NOT NULL, title text NOT NULL CHECK(char_length(title)<=80),
 url text NOT NULL CHECK(char_length(url)<=500 AND url ~* '^https?://'),
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(festival_id,id)
);
--> statement-breakpoint
CREATE TABLE plans (
 code text PRIMARY KEY, name text NOT NULL, duration_months integer NOT NULL CHECK(duration_months>0),
 amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency char(3) NOT NULL DEFAULT 'INR',
 is_active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0,
 features jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE coupons (
 code text PRIMARY KEY, label text NOT NULL,
 duration_months integer NOT NULL CHECK(duration_months IN (1,3,6,12)),
 is_active boolean NOT NULL DEFAULT true, max_redemptions integer CHECK(max_redemptions IS NULL OR max_redemptions>0),
 starts_at timestamptz, expires_at timestamptz,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE coupon_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_code text NOT NULL REFERENCES coupons(code),
 user_id uuid NOT NULL REFERENCES users(id), first_redeemed_at timestamptz NOT NULL DEFAULT now(),
 entitlement_until timestamptz NOT NULL, festival_limit integer, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(coupon_code,user_id)
);
--> statement-breakpoint
CREATE INDEX coupon_redemptions_user_idx ON coupon_redemptions(user_id);
--> statement-breakpoint
CREATE TABLE subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 plan_code text REFERENCES plans(code) ON DELETE SET NULL,
 status text NOT NULL CHECK(status IN ('trial','active','past_due','expired','cancelled','locked')),
 starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz,
 trial_festival_id uuid REFERENCES festivals(id) ON DELETE SET NULL,
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('trial','coupon','upi','gateway','manual')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX subscriptions_user_status_idx ON subscriptions(user_id,status,ends_at DESC);
--> statement-breakpoint
CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_ref text NOT NULL UNIQUE,
 user_id uuid NOT NULL REFERENCES users(id), plan_code text REFERENCES plans(code) ON DELETE SET NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency char(3) NOT NULL DEFAULT 'INR',
 method text NOT NULL CHECK(method IN ('gateway','upi','manual','coupon')),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('created','pending','paid','failed','cancelled','expired','rejected','refunded')),
 utr text, provider text, provider_payment_id text, checkout_url text, paid_at timestamptz,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz, review_note text,
 idempotency_key text UNIQUE, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX payments_user_created_idx ON payments(user_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX payments_status_created_idx ON payments(status,created_at);
--> statement-breakpoint
CREATE INDEX payments_utr_idx ON payments(utr) WHERE utr IS NOT NULL;
--> statement-breakpoint
CREATE TABLE payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
 event_type text NOT NULL, provider_event_id text UNIQUE, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 signature_verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE platform_settings (
 key text PRIMARY KEY, value jsonb NOT NULL,
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO platform_settings(key,value) VALUES('organiser_signup_open','true'::jsonb) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE analytics_visits (
 id bigserial PRIMARY KEY, visitor_key text NOT NULL,
 page_kind text NOT NULL CHECK(page_kind IN ('home','app','public','other')),
 festival_id uuid REFERENCES festivals(id) ON DELETE SET NULL,
 visited_at timestamptz NOT NULL DEFAULT now(),
 day_bucket date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX analytics_visits_day_kind_idx ON analytics_visits(day_bucket,page_kind);
--> statement-breakpoint
CREATE INDEX analytics_visits_festival_idx ON analytics_visits(festival_id,visited_at DESC);
--> statement-breakpoint
CREATE TABLE assistant_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 festival_id uuid REFERENCES festivals(id) ON DELETE SET NULL, client_id text, question_hash text,
 context jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','answered','failed','rate_limited')),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX assistant_usage_created_idx ON assistant_usage(created_at DESC);
--> statement-breakpoint
CREATE TABLE platform_audit_log (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 festival_id uuid REFERENCES festivals(id) ON DELETE SET NULL,
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX platform_audit_target_idx ON platform_audit_log(target_user_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX platform_audit_festival_idx ON platform_audit_log(festival_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX festivals_created_at_idx ON festivals(created_at DESC);