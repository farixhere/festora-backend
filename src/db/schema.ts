import {
  pgTable, text, timestamp, uuid, boolean, bigserial, bigint, integer, smallint,
  numeric, jsonb, date, char, index, uniqueIndex, primaryKey
} from "drizzle-orm/pg-core";

// Drizzle metadata for Festora v1. Composite foreign keys and some SQL CHECK
// constraints are kept in drizzle/0001_festora_domain.sql as the authoritative DDL.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(), username: text("username").notNull(),
  email: text("email"), passwordHash: text("password_hash"), displayName: text("display_name"),
  role: text("role").notNull().default("user"), isActive: boolean("is_active").notNull().default(true),
  phone: text("phone"), institution: text("institution"), place: text("place"),
  accountLockedAt: timestamp("account_locked_at",{withTimezone:true}),
  emailVerifiedAt: timestamp("email_verified_at",{withTimezone:true}), metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
}, t=>({usernameUnique:uniqueIndex("users_username_unique").on(t.username),emailUnique:uniqueIndex("users_email_unique").on(t.email)}));

export const festivals = pgTable("festivals", {
  id:uuid("id").defaultRandom().primaryKey(), name:text("name").notNull(), slug:text("slug"),
  status:text("status").notNull().default("draft"), createdBy:uuid("created_by"),
  data:jsonb("data").notNull().default({}), institution:text("institution"),
  timezone:text("timezone").notNull().default("Asia/Kolkata"), publicMode:text("public_mode").notNull().default("open"),
  publicCodeHash:text("public_code_hash"), registrationClosesOn:date("registration_closes_on"),
  registrationLocked:boolean("registration_locked").notNull().default(false),
  resultsLocked:boolean("results_locked").notNull().default(false), teamLoginLocked:boolean("team_login_locked").notNull().default(false),
  brandColor:text("brand_color"), logoUrl:text("logo_url"), settings:jsonb("settings").notNull().default({}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({slugUnique:uniqueIndex("festivals_slug_unique").on(t.slug),createdAtIdx:index("festivals_created_at_idx").on(t.createdAt)}));

export const festivalMemberships=pgTable("festival_memberships",{
 id:uuid("id").defaultRandom().primaryKey(),festivalId:uuid("festival_id").notNull(),userId:uuid("user_id").notNull(),
 role:text("role").notNull(),teamId:text("team_id"),displayName:text("display_name"),
 isActive:boolean("is_active").notNull().default(true),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({membershipUnique:uniqueIndex("festival_memberships_festival_user_unique").on(t.festivalId,t.userId),userIdx:index("festival_memberships_user_idx").on(t.userId)}));

export const sessions=pgTable("sessions",{
 id:uuid("id").defaultRandom().primaryKey(),userId:uuid("user_id").notNull(),tokenHash:text("token_hash").notNull(),
 expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),revokedAt:timestamp("revoked_at",{withTimezone:true}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({tokenUnique:uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),userIdx:index("sessions_user_idx").on(t.userId)}));

export const operationLog=pgTable("operation_log",{
 seq:bigserial("seq",{mode:"number"}).primaryKey(),festivalId:uuid("festival_id").notNull(),actorId:uuid("actor_id"),
 operation:jsonb("operation").notNull(),festivalSeq:bigint("festival_seq",{mode:"number"}),clientId:text("client_id"),
 operationType:text("operation_type"),actorRole:text("actor_role"),actorTeamId:text("actor_team_id"),
 requestHash:text("request_hash"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({festivalSeqIdx:index("operation_log_festival_seq_idx").on(t.festivalId,t.festivalSeq),clientUnique:uniqueIndex("operation_log_festival_client_unique").on(t.festivalId,t.clientId)}));

export const festivalCounters=pgTable("festival_counters",{
 festivalId:uuid("festival_id").primaryKey(),lastSeq:bigint("last_seq",{mode:"number"}).notNull().default(0),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const organiserProfiles=pgTable("organiser_profiles",{
 userId:uuid("user_id").primaryKey(),institution:text("institution").notNull(),phone:text("phone"),place:text("place"),
 signupSource:text("signup_source").notNull().default("web"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const emailOtpChallenges=pgTable("email_otp_challenges",{
 id:uuid("id").defaultRandom().primaryKey(),email:text("email").notNull(),codeHash:text("code_hash").notNull(),
 purpose:text("purpose").notNull(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
 consumedAt:timestamp("consumed_at",{withTimezone:true}),attempts:integer("attempts").notNull().default(0),
 maxAttempts:integer("max_attempts").notNull().default(5),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});

export const festivalTeams=pgTable("festival_teams",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),name:text("name").notNull(),
 sortOrder:integer("sort_order").notNull().default(0),isActive:boolean("is_active").notNull().default(true),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));
const festivalDictionary=(tableName:string)=>pgTable(tableName,{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),name:text("name").notNull(),
 sortOrder:integer("sort_order").notNull().default(0),metadata:jsonb("metadata").notNull().default({})
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));
export const festivalCategories=festivalDictionary("festival_categories");
export const festivalStages=festivalDictionary("festival_stages");
export const festivalSubfestivals=festivalDictionary("festival_subfestivals");

export const candidates=pgTable("candidates",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),name:text("name").notNull(),
 teamId:text("team_id").notNull(),categoryId:text("category_id").notNull(),skills:jsonb("skills").notNull().default([]),
 photoUrl:text("photo_url"),legacyPhotoData:text("legacy_photo_data"),status:text("status").notNull().default("active"),
 createdBy:uuid("created_by"),updatedBy:uuid("updated_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]}),teamIdx:index("candidates_team_idx").on(t.festivalId,t.teamId)}));

export const programmes=pgTable("programmes",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),name:text("name").notNull(),
 categoryId:text("category_id").notNull(),stageId:text("stage_id").notNull(),subfestivalId:text("subfestival_id"),
 topicsEnabled:boolean("topics_enabled").notNull().default(false),status:text("status").notNull().default("pending"),
 resultPublishedAt:timestamp("result_published_at",{withTimezone:true}),metadata:jsonb("metadata").notNull().default({}),
 createdBy:uuid("created_by"),updatedBy:uuid("updated_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]}),statusIdx:index("programmes_status_idx").on(t.festivalId,t.status)}));
export const programmeParticipants=pgTable("programme_participants",{
 festivalId:uuid("festival_id").notNull(),programmeId:text("programme_id").notNull(),candidateId:text("candidate_id").notNull(),
 topic:text("topic"),sortOrder:integer("sort_order").notNull().default(0),enrolledAt:timestamp("enrolled_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.programmeId,t.candidateId]})}));
export const programmeJudges=pgTable("programme_judges",{
 festivalId:uuid("festival_id").notNull(),programmeId:text("programme_id").notNull(),judgeUserId:uuid("judge_user_id").notNull(),
 assignedBy:uuid("assigned_by"),assignedAt:timestamp("assigned_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.programmeId,t.judgeUserId]})}));
export const judgeSubmissions=pgTable("judge_submissions",{
 festivalId:uuid("festival_id").notNull(),programmeId:text("programme_id").notNull(),judgeUserId:uuid("judge_user_id").notNull(),
 submittedAt:timestamp("submitted_at",{withTimezone:true}).notNull().defaultNow(),submittedBy:uuid("submitted_by"),
 revision:integer("revision").notNull().default(1)
},t=>({pk:primaryKey({columns:[t.festivalId,t.programmeId,t.judgeUserId]})}));
export const judgeMarks=pgTable("judge_marks",{
 festivalId:uuid("festival_id").notNull(),programmeId:text("programme_id").notNull(),judgeUserId:uuid("judge_user_id").notNull(),
 candidateId:text("candidate_id").notNull(),score:numeric("score",{precision:5,scale:1}).notNull(),
 criteria:jsonb("criteria").notNull().default({}),remarks:text("remarks"),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.programmeId,t.judgeUserId,t.candidateId]})}));
export const programmeSchedule=pgTable("programme_schedule",{
 festivalId:uuid("festival_id").notNull(),programmeId:text("programme_id").notNull(),stageId:text("stage_id").notNull(),
 dayNumber:smallint("day_number").notNull(),startMinute:smallint("start_minute").notNull(),durationMinutes:smallint("duration_minutes"),
 updatedBy:uuid("updated_by"),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.programmeId]})}));
export const programmeAppeals=pgTable("programme_appeals",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),programmeId:text("programme_id").notNull(),
 candidateId:text("candidate_id").notNull(),teamId:text("team_id").notNull(),reason:text("reason").notNull(),
 status:text("status").notNull().default("pending"),submittedBy:uuid("submitted_by"),decidedBy:uuid("decided_by"),
 decisionNote:text("decision_note"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 decidedAt:timestamp("decided_at",{withTimezone:true})
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));

export const festivalAnnouncements=pgTable("festival_announcements",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),body:text("body").notNull(),
 createdBy:uuid("created_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));
export const festivalNotifications=pgTable("festival_notifications",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),body:text("body").notNull(),recipient:text("recipient").notNull().default("all"),
 createdBy:uuid("created_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),readAt:timestamp("read_at",{withTimezone:true})
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));
export const festivalGalleryAssets=pgTable("festival_gallery_assets",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),storageKey:text("storage_key"),sourceUrl:text("source_url"),
 caption:text("caption"),mimeType:text("mime_type"),byteSize:bigint("byte_size",{mode:"number"}),
 createdBy:uuid("created_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));
export const festivalLinks=pgTable("festival_links",{
 festivalId:uuid("festival_id").notNull(),id:text("id").notNull(),title:text("title").notNull(),url:text("url").notNull(),
 createdBy:uuid("created_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>({pk:primaryKey({columns:[t.festivalId,t.id]})}));

export const plans=pgTable("plans",{
 code:text("code").primaryKey(),name:text("name").notNull(),durationMonths:integer("duration_months").notNull(),
 amountMinor:bigint("amount_minor",{mode:"number"}).notNull(),currency:char("currency",{length:3}).notNull().default("INR"),
 isActive:boolean("is_active").notNull().default(true),displayOrder:integer("display_order").notNull().default(0),
 features:jsonb("features").notNull().default({}),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const coupons=pgTable("coupons",{
 code:text("code").primaryKey(),label:text("label").notNull(),durationMonths:integer("duration_months").notNull(),
 isActive:boolean("is_active").notNull().default(true),maxRedemptions:integer("max_redemptions"),
 startsAt:timestamp("starts_at",{withTimezone:true}),expiresAt:timestamp("expires_at",{withTimezone:true}),
 createdBy:uuid("created_by"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const couponRedemptions=pgTable("coupon_redemptions",{
 id:uuid("id").defaultRandom().primaryKey(),couponCode:text("coupon_code").notNull(),userId:uuid("user_id").notNull(),
 firstRedeemedAt:timestamp("first_redeemed_at",{withTimezone:true}).notNull().defaultNow(),
 entitlementUntil:timestamp("entitlement_until",{withTimezone:true}).notNull(),festivalLimit:integer("festival_limit"),metadata:jsonb("metadata").notNull().default({})
},t=>({couponUserUnique:uniqueIndex("coupon_redemptions_coupon_code_user_id_key").on(t.couponCode,t.userId)}));
export const subscriptions=pgTable("subscriptions",{
 id:uuid("id").defaultRandom().primaryKey(),userId:uuid("user_id").notNull(),planCode:text("plan_code"),
 status:text("status").notNull(),startsAt:timestamp("starts_at",{withTimezone:true}).notNull().defaultNow(),
 endsAt:timestamp("ends_at",{withTimezone:true}),trialFestivalId:uuid("trial_festival_id"),source:text("source").notNull().default("manual"),
 metadata:jsonb("metadata").notNull().default({}),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const payments=pgTable("payments",{
 id:uuid("id").defaultRandom().primaryKey(),publicRef:text("public_ref").notNull(),userId:uuid("user_id").notNull(),
 planCode:text("plan_code"),amountMinor:bigint("amount_minor",{mode:"number"}).notNull(),currency:char("currency",{length:3}).notNull().default("INR"),
 method:text("method").notNull(),status:text("status").notNull().default("pending"),utr:text("utr"),provider:text("provider"),
 providerPaymentId:text("provider_payment_id"),checkoutUrl:text("checkout_url"),paidAt:timestamp("paid_at",{withTimezone:true}),
 reviewedBy:uuid("reviewed_by"),reviewedAt:timestamp("reviewed_at",{withTimezone:true}),reviewNote:text("review_note"),
 idempotencyKey:text("idempotency_key"),metadata:jsonb("metadata").notNull().default({}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>({publicRefUnique:uniqueIndex("payments_public_ref_key").on(t.publicRef),idempotencyUnique:uniqueIndex("payments_idempotency_key_key").on(t.idempotencyKey)}));
export const paymentEvents=pgTable("payment_events",{
 id:uuid("id").defaultRandom().primaryKey(),paymentId:uuid("payment_id").notNull(),eventType:text("event_type").notNull(),
 providerEventId:text("provider_event_id"),payload:jsonb("payload").notNull().default({}),
 signatureVerified:boolean("signature_verified").notNull().default(false),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});
export const platformSettings=pgTable("platform_settings",{
 key:text("key").primaryKey(),value:jsonb("value").notNull(),updatedBy:uuid("updated_by"),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});
export const analyticsVisits=pgTable("analytics_visits",{
 id:bigserial("id",{mode:"number"}).primaryKey(),visitorKey:text("visitor_key").notNull(),pageKind:text("page_kind").notNull(),
 festivalId:uuid("festival_id"),visitedAt:timestamp("visited_at",{withTimezone:true}).notNull().defaultNow(),
 dayBucket:date("day_bucket").notNull(),metadata:jsonb("metadata").notNull().default({})
});
export const assistantUsage=pgTable("assistant_usage",{
 id:uuid("id").defaultRandom().primaryKey(),userId:uuid("user_id"),festivalId:uuid("festival_id"),
 clientId:text("client_id"),questionHash:text("question_hash"),context:jsonb("context").notNull().default({}),
 status:text("status").notNull().default("received"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});
export const platformAuditLog=pgTable("platform_audit_log",{
 id:bigserial("id",{mode:"number"}).primaryKey(),actorId:uuid("actor_id"),targetUserId:uuid("target_user_id"),
 festivalId:uuid("festival_id"),action:text("action").notNull(),details:jsonb("details").notNull().default({}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});

export type User=typeof users.$inferSelect;
export type NewUser=typeof users.$inferInsert;
export type Festival=typeof festivals.$inferSelect;
export type NewFestival=typeof festivals.$inferInsert;
