import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

export function buildLLM(opts: { temperature?: number } = {}): BaseChatModel {
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const temperature = opts.temperature ?? 0;
  if (!apiKey) throw new Error("Set LLM_API_KEY in the agent .env before starting Agent Engine");

  if (provider === "anthropic") {
    return new ChatAnthropic({ apiKey, model: model === "gpt-4o-mini" ? "claude-3-5-haiku-latest" : model, temperature });
  }
  if (provider === "google" || provider === "gemini") {
    return new ChatGoogleGenerativeAI({ apiKey, model: model === "gpt-4o-mini" ? "gemini-2.0-flash" : model, temperature });
  }
  return new ChatOpenAI({
    apiKey,
    model,
    temperature,
    configuration: process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : undefined,
  });
}
