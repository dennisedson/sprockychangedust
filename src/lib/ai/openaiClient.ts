// @workflow_state: REVIEW
import OpenAI from "openai";
import { env } from "@/lib/env";

export function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    return undefined;
  }

  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export function getOpenAIModel() {
  return env.OPENAI_MODEL;
}

export function getOpenAIBatchModel() {
  return env.OPENAI_BATCH_MODEL || env.OPENAI_MODEL;
}
