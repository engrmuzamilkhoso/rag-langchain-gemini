// ─────────────────────────────────────────────────────────────
// GEMINI: the one place that creates Gemini clients (chat + embeddings)
// ─────────────────────────────────────────────────────────────
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config } from "../config.js";

// Missing key → clear message at startup, not a confusing error on the first chat message
export function assertGeminiConfig(): void {
  if (!config.gemini.apiKey.trim()) {
    throw new Error("GEMINI_API_KEY is empty. Copy .env.example to .env and add your key.");
  }
}

export function createGeminiChatModel(temperature = 0): ChatGoogleGenerativeAI {
  assertGeminiConfig();
  return new ChatGoogleGenerativeAI({
    apiKey: config.gemini.apiKey, // passed explicitly: the package's default env name is GOOGLE_API_KEY
    model: config.gemini.chatModel,
    temperature, // 0 = most predictable answers
    maxRetries: 2, // retry short overloads (503) and rate limits (429), then fail
  });
}

export function createGeminiEmbeddings(): GoogleGenerativeAIEmbeddings {
  assertGeminiConfig();
  return new GoogleGenerativeAIEmbeddings({
    apiKey: config.gemini.apiKey,
    model: config.gemini.embedModel,
    outputDimensionality: config.gemini.embedDimensions, // Gemini's default is bigger; the table expects 768
  });
}

// Gemini overloaded (503), out of quota (429) or too slow (timeout) → a message the customer can understand
export function isGeminiBusy(error: unknown): boolean {
  const { status, name } = (error ?? {}) as { status?: unknown; name?: unknown };
  return status === 429 || status === 503 || name === "AbortError" || name === "TimeoutError";
}
