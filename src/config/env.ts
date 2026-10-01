import { z } from "zod";

/*
Every environment variable the server reads, validated once at boot.

Before this, config was read with process.env.X scattered through the
code, URLs were hardcoded to localhost, and a missing variable surfaced
as a confusing runtime failure (an empty MONGO_URL printed "URL NOT
FOUND"; an empty GROQ_API_KEY crashed the process on import).

Importing this module throws with a readable list of what is wrong, so
the server refuses to start misconfigured rather than half-working.
*/

const isProduction = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  // ── datastores ──────────────────────────────────────────────
  MONGO_URL: z.string().min(1, "MONGO_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  /*
  32 characters minimum. A short secret is brute-forceable, and this one
  signs every session cookie.
  */
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),

  /*
  Encrypts GitHub access tokens at rest. 64 hex characters = a 32-byte
  AES-256 key. Generate one with:  openssl rand -hex 32
  */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be 64 hex characters"),

  // ── URLs (were hardcoded to localhost) ──────────────────────
  // Where the browser app lives: CORS origin and OAuth redirect target.
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  // This server's own public URL, used to build the OAuth callback.
  API_URL: z.string().url().default("http://localhost:4000"),

  // ── GitHub ──────────────────────────────────────────────────
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(1, "GITHUB_WEBHOOK_SECRET is required"),
  // Public URL GitHub posts webhooks to. Empty = webhook registration skipped.
  GITHUB_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),

  // ── model provider ──────────────────────────────────────────
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),

  // ── cookies ─────────────────────────────────────────────────
  /*
  Leave unset for localhost. In production set it to the parent domain
  shared by the app and the API, e.g. ".mergegate.com".
  */
  COOKIE_DOMAIN: z.string().optional(),
  /*
  "lax" works when the app and API share a site. When they are on
  different domains the browser drops the cookie unless this is "none",
  which also requires secure cookies (so, HTTPS).
  */
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  console.error(
    `\nInvalid environment configuration:\n${problems}\n\nSee .env.example for the full list.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

if (isProduction && raw.COOKIE_SAME_SITE === "none" && !raw.API_URL.startsWith("https://")) {
  console.error(
    "\nCOOKIE_SAME_SITE=none requires HTTPS — browsers reject a SameSite=None cookie that is not Secure.\n",
  );
  process.exit(1);
}

export const env = {
  ...raw,
  isProduction,
  /*
  Cookie options used by every res.cookie call, so login and the GitHub
  callback cannot drift apart (they previously set different flags).
  */
  cookie: {
    httpOnly: true,
    // Insecure cookies are only acceptable on a local HTTP dev server.
    secure: isProduction,
    sameSite: raw.COOKIE_SAME_SITE,
    domain: raw.COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  } as const,
};

export type Env = typeof env;
