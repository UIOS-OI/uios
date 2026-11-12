import { createHash } from "node:crypto";
import type { ModelMessage, ModelProvider } from "@uios/contracts";
import { providerLocality } from "@uios/router";
import { getModelRouter, NoEligibleProviderError, remoteAllowedWithoutConsent, routingPolicy } from "./platform-services";
import { signPurposeToken, verifyPurposeToken } from "./runtime";

const CONSENT_PURPOSE = "cloud-model-consent";
const CONSENT_TTL_SECONDS = 300;

/** Digest of exactly what would be sent. A consent token only authorizes this content. */
export function messagesDigest(messages: Array<Pick<ModelMessage, "role" | "content">>): string {
  const hash = createHash("sha256");
  for (const message of messages) hash.update(`${message.role}\u0000${message.content}\u0001`);
  return hash.digest("base64url");
}

export type DisclosureReason = "no-local-provider" | "local-unavailable" | "local-failed";

export type CloudDisclosure = {
  consentRequired: true;
  reason: DisclosureReason;
  localError?: string;
  provider: { id: string; destination: string; model?: string };
  data: { messages: number; totalChars: number; segments: Array<{ index: number; role: string; chars: number }> };
  consentToken: string;
  expiresInSeconds: number;
  instructions: string;
};

function remoteProviders(): ModelProvider[] {
  return getModelRouter()?.allProviders().filter((provider) => providerLocality(provider) === "remote") ?? [];
}

/**
 * Builds the 409 response that asks the user for cloud consent. Nothing is sent to the remote provider
 * until the client returns the token with byte-identical messages.
 */
export async function cloudConsentResponse(tenantId: string, messages: Array<Pick<ModelMessage, "role" | "content">>, reason: DisclosureReason, localError?: string): Promise<Response | null> {
  if (routingPolicy() !== "consent") return null;
  const target = remoteProviders()[0];
  if (!target) return null;
  const model = await target.listModels().then((models) => models.find((m) => m.capabilities.includes("chat"))?.id).catch(() => undefined);
  const disclosure: CloudDisclosure = {
    consentRequired: true,
    reason,
    ...(localError ? { localError: localError.slice(0, 200) } : {}),
    provider: { id: target.id, destination: target.destination ?? "unknown", ...(model ? { model } : {}) },
    data: {
      messages: messages.length,
      totalChars: messages.reduce((total, message) => total + message.content.length, 0),
      segments: messages.map((message, index) => ({ index, role: message.role, chars: message.content.length })),
    },
    consentToken: signPurposeToken(CONSENT_PURPOSE, { tenantId, providerId: target.id, digest: messagesDigest(messages) }, CONSENT_TTL_SECONDS),
    expiresInSeconds: CONSENT_TTL_SECONDS,
    instructions: "Local inference is not available. To send exactly these messages to the listed remote provider, repeat the request unchanged with `cloudConsent` set to `consentToken`.",
  };
  return Response.json({ error: "Local model unavailable; cloud use requires your consent.", ...disclosure }, { status: 409, headers: { "X-UIOS-Consent": "required" } });
}

export type ProviderPlan =
  | { ok: true; providers: ModelProvider[]; remoteConsented: boolean; strategy: string }
  | { ok: false; response: Response };

/**
 * Ordered providers a request may use. Local providers come first; remote providers are included only
 * under the cloud-allowed policy or with a valid consent token for these exact messages.
 */
export async function planProviders(input: {
  tenantId: string;
  messages: Array<Pick<ModelMessage, "role" | "content">>;
  consentToken?: unknown;
  provider?: string;
  capability?: "chat" | "tools";
}): Promise<ProviderPlan> {
  const router = getModelRouter();
  if (!router) {
    return { ok: false, response: Response.json({ error: "No model provider is configured. Set UIOS_OLLAMA_CHAT_MODEL for local inference (see SETUP.md)." }, { status: 503 }) };
  }
  let consentedProvider: string | undefined;
  if (input.consentToken !== undefined) {
    const claims = typeof input.consentToken === "string" ? verifyPurposeToken(CONSENT_PURPOSE, input.consentToken) : null;
    if (!claims || claims.tenantId !== input.tenantId || claims.digest !== messagesDigest(input.messages) || typeof claims.providerId !== "string") {
      return { ok: false, response: Response.json({ error: "Cloud consent is invalid, expired, or does not match these messages. Request a new disclosure." }, { status: 403 }) };
    }
    if (routingPolicy() === "local-only") {
      return { ok: false, response: Response.json({ error: "This deployment is local-only; cloud providers cannot be used." }, { status: 403 }) };
    }
    consentedProvider = claims.providerId;
  }
  const allowRemote = remoteAllowedWithoutConsent() || Boolean(consentedProvider);
  const strategy = (process.env.UIOS_ROUTING_STRATEGY as "fastest" | "balanced" | "explicit" | undefined) ?? "explicit";
  try {
    const { providers } = await router.candidates({
      messages: input.messages as ModelMessage[],
      strategy,
      allowRemote,
      capability: input.capability,
      provider: consentedProvider ?? input.provider,
    });
    return { ok: true, providers, remoteConsented: Boolean(consentedProvider), strategy };
  } catch (error) {
    if (error instanceof NoEligibleProviderError) {
      const local = router.allProviders().filter((provider) => providerLocality(provider) === "local");
      const consent = await cloudConsentResponse(input.tenantId, input.messages, local.length ? "local-unavailable" : "no-local-provider", error.message);
      if (consent) return { ok: false, response: consent };
      return { ok: false, response: Response.json({ error: routingPolicy() === "local-only" ? `Local model unavailable: ${error.message}` : "UIOS could not select a model provider." }, { status: 503 }) };
    }
    throw error;
  }
}
