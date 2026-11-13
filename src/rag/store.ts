// ─────────────────────────────────────────────────────────────
// THE VECTOR STORE: where chunks + their numbers live (Postgres + pgvector)
// ─────────────────────────────────────────────────────────────
import { PGVectorStore } from "@langchain/pgvector";
import { config } from "../config.js";
import { pool } from "../db.js";
import { createGeminiEmbeddings } from "../llm/gemini.js";

// Turns text into 768 numbers (Gemini embeddings)
const embeddings = createGeminiEmbeddings();

// Connects to Postgres. Creates the vector table the first time.
export function getStore(): Promise<PGVectorStore> {
  return PGVectorStore.initialize(embeddings, {
    pool, // reuse the app's one connection
    tableName: config.vectorTable,
    distanceStrategy: "cosine",
    dimensions: config.gemini.embedDimensions,
    scoreNormalization: "similarity", // higher score = more similar (0 to 1)
  });
}
