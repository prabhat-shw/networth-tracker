// Fixed, throwaway settings for the E2E stack (ADR-0035). Nothing here is a real secret:
// the database and mail sink exist only for the run.
export const E2E_ORIGIN = "http://localhost:3100";
export const MAILPIT = "http://127.0.0.1:8025";

export const E2E_ENV: Record<string, string> = {
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? "postgres://nwt:nwt@127.0.0.1:55432/nwt",
  BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0000",
  APP_ORIGIN: E2E_ORIGIN,
  DEMO_MODE: "false",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "NetWorth E2E <e2e@example.test>",
  NEXT_TELEMETRY_DISABLED: "1",
};
