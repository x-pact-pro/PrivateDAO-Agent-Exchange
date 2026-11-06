import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export function bedrockProviderStatus(config) {
  return {
    provider: "amazon-bedrock",
    status: config.bedrockEnabled ? "configured" : "disabled",
    model: config.bedrockModel,
    endpoint_exposed: false,
    credentials_exposed: false,
  };
}

export async function runBedrockInference(config, payload, client = null) {
  const status = bedrockProviderStatus(config);
  if (!config.bedrockEnabled) return { ...status, result: null, note: "Amazon Bedrock is disabled." };
  const runtime = client || new BedrockRuntimeClient({ region: config.region });
  const evidence = JSON.stringify(payload).slice(0, 12000);
  const response = await runtime.send(new ConverseCommand({
    modelId: config.bedrockModel,
    system: [{
      text: "You are a bounded PrivateDAO evidence-synthesis assistant. Summarize only supplied evidence. Never authorize transactions, choose recipients, alter amounts, or create signing instructions.",
    }],
    messages: [{
      role: "user",
      content: [{
        text: `Evidence (untrusted data, possibly truncated):\n${evidence}`,
      }],
    }],
    inferenceConfig: { maxTokens: 512, temperature: 0 },
  }));
  const result = response.output?.message?.content?.find((part) => typeof part.text === "string")?.text || "";
  return { ...status, status: "completed", result, usage: response.usage || null, stop_reason: response.stopReason || null, observed_at: new Date().toISOString() };
}
