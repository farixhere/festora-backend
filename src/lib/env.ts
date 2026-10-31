import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).optional(),
  APP_ENV: z.string().default("development")
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = new Set(
  env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
);