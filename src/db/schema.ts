import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  bigserial,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

// The first schema intentionally covers only verified platform foundations.
// Domain-specific participant, judging, programme and payment tables will be
// added after their existing frontend data contracts are mapped.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  usernameUnique: uniqueIndex("users_username_unique").on(table.username),
  emailUnique: uniqueIndex("users_email_unique").on(table.email)
}));

export const festivals = pgTable("festivals", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  status: text("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  slugUnique: uniqueIndex("festivals_slug_unique").on(table.slug),
  createdByIdx: index("festivals_created_by_idx").on(table.createdBy)
}));

export const festivalMemberships = pgTable("festival_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  festivalId: uuid("festival_id").notNull().references(() => festivals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  membershipUnique: uniqueIndex("festival_memberships_festival_user_unique").on(table.festivalId, table.userId),
  userIdx: index("festival_memberships_user_idx").on(table.userId)
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  userIdx: index("sessions_user_idx").on(table.userId),
  expiryIdx: index("sessions_expires_at_idx").on(table.expiresAt)
}));

export const operationLog = pgTable("operation_log", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(),
  festivalId: uuid("festival_id").notNull().references(() => festivals.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  operation: jsonb("operation").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  festivalSeqIdx: index("operation_log_festival_seq_idx").on(table.festivalId, table.seq)
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Festival = typeof festivals.$inferSelect;
export type NewFestival = typeof festivals.$inferInsert;