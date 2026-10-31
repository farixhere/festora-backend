CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "email" text,
  "password_hash" text,
  "display_name" text,
  "role" text DEFAULT 'user' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "festivals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "festivals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "festivals_slug_unique" ON "festivals" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "festivals_created_by_idx" ON "festivals" USING btree ("created_by");
--> statement-breakpoint
CREATE TABLE "festival_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "festival_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "festival_memberships_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE,
  CONSTRAINT "festival_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "festival_memberships_festival_user_unique" ON "festival_memberships" USING btree ("festival_id", "user_id");
--> statement-breakpoint
CREATE INDEX "festival_memberships_user_idx" ON "festival_memberships" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE "operation_log" (
  "seq" bigserial PRIMARY KEY NOT NULL,
  "festival_id" uuid NOT NULL,
  "actor_id" uuid,
  "operation" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "operation_log_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE,
  CONSTRAINT "operation_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "operation_log_festival_seq_idx" ON "operation_log" USING btree ("festival_id", "seq");