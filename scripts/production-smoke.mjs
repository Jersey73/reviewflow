import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const text = async (file) => readFile(new URL(file, root), "utf8");
const required = [
  "app/rate/[slug]/page.tsx",
  "components/CustomerFlow.tsx",
  "components/AdminQRGenerator.tsx",
  "app/api/generate-review/route.ts",
  "app/api/feedback/route.ts",
  "lib/public-security.ts",
  ".env.example",
  "supabase/16_feedback_idempotency.sql",
  "supabase/17_verify_production_security.sql",
];

for (const file of required) await access(new URL(file, root));

const customer = await text("components/CustomerFlow.tsx");
const security = await text("lib/public-security.ts");
const generator = await text("app/api/generate-review/route.ts");
const env = await text(".env.example");
const feedback = await text("app/api/feedback/route.ts");

const checks = [
  ["AI limit is 15/10m", /aiGeneration:\s*\{\s*limit:\s*15,\s*windowMs:\s*10 \* 60 \* 1000/],
  ["Customer flow has clipboard fallback", /document\.execCommand\("copy"\)/],
  ["Customer flow prevents concurrent generation", /generatingRef/],
  ["Feedback uses idempotency key", /idempotencyKey/],
  ["Gemini uses systemInstruction", /systemInstruction/],
  ["Gemini marks customer data untrusted", /untrusted data/i],
  ["Service-role key documented server-only", /SUPABASE_SERVICE_ROLE_KEY=/],
  ["Gemini key documented server-only", /GEMINI_API_KEY=/],
];

for (const [name, pattern] of checks) {
  const haystack = name.includes("limit") ? security
    : name.includes("clipboard") || name.includes("concurrent") ? customer
    : name.includes("idempotency") ? feedback
    : name.includes("systemInstruction") || name.includes("untrusted") ? generator
    : env;
  if (!pattern.test(haystack)) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

if (/NEXT_PUBLIC_(?:SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY)/.test(env)) {
  throw new Error("FAIL: secret incorrectly prefixed NEXT_PUBLIC_");
}
console.log("PASS: production smoke invariants");
