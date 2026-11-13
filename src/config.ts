// ─────────────────────────────────────────────────────────────
// ALL SETTINGS IN ONE PLACE
// Change a model, a URL or a number here, nowhere else.
// Secrets come from .env (see .env.example), never from code.
// ─────────────────────────────────────────────────────────────

export const config = {
  // Postgres: Supabase (DATABASE_URL in .env) or the local Docker container "rag-db"
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5433/rag", // || : empty → local too
  databaseCaFile: "certs/supabase-ca.crt", // Supabase's SSL certificate: proves we're really talking to Supabase

  // Gemini (Google AI Studio API key)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    chatModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash", // agent + RAG answers (supports tool calling)
    embedModel: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001", // text → numbers
    embedDimensions: 768, // must match the vector table; changing it means re-running ingest
    timeoutMs: 30_000, // a stuck Gemini call fails after 30s instead of hanging the chat
  },

  // Vector table. Its own name, so it never mixes with vectors from another embedding model.
  vectorTable: "lc_documents_gemini",

  // Documents
  docsFolder: "docs",
  chunkSize: 300, // max characters per chunk
  chunkOverlap: 30, // characters repeated between chunks

  // Search
  topK: 4, // how many chunks to fetch
  minScore: 0.8, // ignore chunks below this (LangChain's 0–1 similarity scale)

  // OTP
  otpSecret: process.env.OTP_SECRET ?? "dev-only-secret-change-me",
  otpMinutes: 5, // code expires after 5 minutes
  otpMaxAttempts: 3, // wrong tries before the code is blocked
};
