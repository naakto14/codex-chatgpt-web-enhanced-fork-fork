import { createHash } from "node:crypto";
import { formatErrorResponse } from "./bridge";
import type { AppConfig } from "./config";
import type { CodexModelContextOverride } from "./codex-integration";
import { augmentNativeModelCatalog, nativeCatalogHasSolBackedWebEligibility } from "./model-catalog";
import { forwardNativeCodexRequest, type NativeFetch } from "./native-passthrough";

export async function modelsRequest(
  req: Request,
  config: AppConfig,
  fetchUpstream?: NativeFetch,
  contextOverride?: () => CodexModelContextOverride | undefined,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await forwardNativeCodexRequest(req, "models", fetchUpstream);
  } catch (error) {
    return formatErrorResponse(502, "upstream_error", error instanceof Error ? error.message : String(error));
  }
  if (!upstream.ok) return upstream;
  let catalog: Record<string, unknown>;
  try {
    const nativeCatalog = await upstream.json();
    if (!config.solAvailable && nativeCatalogHasSolBackedWebEligibility(nativeCatalog)) {
      // Luna Reserve removes the browser effort selector, which made the setup probe report a
      // false Luna-only capability. The hidden native reserve row is the account-level signal that
      // the Sol-backed Web routes remain valid; retain that capability for this running service.
      config.solAvailable = true;
    }
    catalog = augmentNativeModelCatalog(nativeCatalog, config, contextOverride?.());
  } catch (error) {
    return formatErrorResponse(502, "invalid_response_error", error instanceof Error ? error.message : String(error));
  }
  const body = JSON.stringify(catalog);
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  headers.set("etag", `W/\"${createHash("sha256").update(body).digest("base64url")}\"`);
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export async function nativeSearchRequest(req: Request, fetchUpstream?: NativeFetch): Promise<Response> {
  try {
    return await forwardNativeCodexRequest(req, "alpha/search", fetchUpstream);
  } catch (error) {
    return formatErrorResponse(502, "upstream_error", error instanceof Error ? error.message : String(error));
  }
}
