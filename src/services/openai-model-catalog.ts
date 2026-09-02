import axios from "axios"
import NodeCache from "node-cache"
import deepEqual from "fast-deep-equal"
import { z } from "zod"

import {
	type ModelInfo,
	type ProviderSettings,
	openAiModelInfoSaneDefaults,
	providerIdentifiers,
} from "@roo-code/types"

import type { ClineProvider } from "../core/webview/ClineProvider"

/**
 * Resolves capabilities of OpenAI-Compatible models from an external manifest in models.dev /
 * opencode format, since `GET {baseUrl}/models` only yields model ids and everything else would
 * fall back to `openAiModelInfoSaneDefaults`. The resolved capabilities are written to the
 * profile's `openAiCustomModelInfo`, the field both `OpenAiHandler.getModel` and the webview's
 * `useSelectedModel` already read.
 *
 * Only profiles whose base URL matches CATALOG_BASE_URL_MATCH are resolved. The manifest URL and
 * that match can be overridden through the environment; setting either to an empty value disables
 * the resolution entirely.
 */

const CATALOG_URL_ENV_VAR = "ZOO_CODE_OPENAI_MODEL_CATALOG_URL"
const CATALOG_BASE_URL_MATCH_ENV_VAR = "ZOO_CODE_OPENAI_MODEL_CATALOG_BASE_URL"
const DEFAULT_CATALOG_URL = "https://plugins.ai.t-systems.net/external/.well-known/opencode"
const DEFAULT_CATALOG_BASE_URL_MATCH = "llm-server.llmhub.t-systems.net"
const CATALOG_DESCRIPTION_SUFFIX = " (model catalog)"
const CATALOG_FETCH_TIMEOUT_MS = 10_000
const CATALOG_CACHE_TTL_SECONDS = 60 * 60

const reasoningEfforts = ["disable", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const
type CatalogReasoningEffort = (typeof reasoningEfforts)[number]

const catalogModelSchema = z
	.object({
		name: z.string().optional(),
		attachment: z.boolean().optional(),
		temperature: z.boolean().optional(),
		modalities: z
			.object({ input: z.array(z.string()).optional(), output: z.array(z.string()).optional() })
			.passthrough()
			.optional(),
		limit: z.object({ context: z.number().optional(), output: z.number().optional() }).passthrough().optional(),
		cost: z
			.object({
				input: z.number().optional(),
				output: z.number().optional(),
				cache_read: z.number().optional(),
				cache_write: z.number().optional(),
			})
			.passthrough()
			.optional(),
		variants: z
			.record(
				z.string(),
				z
					.object({ reasoningEffort: z.string().optional(), disabled: z.boolean().optional() })
					.passthrough()
					.nullish(),
			)
			.optional(),
	})
	.passthrough()

const catalogProviderSchema = z
	.object({
		options: z.object({ baseURL: z.string().optional() }).passthrough().optional(),
		models: z.record(z.string(), catalogModelSchema).optional(),
	})
	.passthrough()

type CatalogModel = z.infer<typeof catalogModelSchema>
type CatalogProvider = z.infer<typeof catalogProviderSchema>

const catalogCache = new NodeCache({ stdTTL: CATALOG_CACHE_TTL_SECONDS, checkperiod: CATALOG_CACHE_TTL_SECONDS })
let inFlightFetch: Promise<CatalogProvider[]> | undefined

function resolveEnvOverride(envVar: string, fallback: string): string {
	const configured = process.env[envVar]
	return (configured === undefined ? fallback : configured).trim()
}

export function getOpenAiModelCatalogUrl(): string | undefined {
	const url = resolveEnvOverride(CATALOG_URL_ENV_VAR, DEFAULT_CATALOG_URL)
	return url && URL.canParse(url) ? url : undefined
}

function normalizeUrl(url: string): string {
	return url.trim().replace(/\/+$/, "").toLowerCase()
}

function isCatalogBaseUrl(baseUrl: string | undefined): boolean {
	const match = resolveEnvOverride(CATALOG_BASE_URL_MATCH_ENV_VAR, DEFAULT_CATALOG_BASE_URL_MATCH)
	return !!match && !!baseUrl && normalizeUrl(baseUrl).includes(normalizeUrl(match))
}

function collectProviders(data: unknown): CatalogProvider[] {
	if (!data || typeof data !== "object") {
		return []
	}

	const record = data as Record<string, unknown>
	const nested = (record.config as Record<string, unknown> | undefined)?.provider ?? record.provider

	if (nested && typeof nested === "object") {
		return collectProviders(nested)
	}

	if (record.models && typeof record.models === "object") {
		const parsed = catalogProviderSchema.safeParse(record)
		return parsed.success ? [parsed.data] : []
	}

	return Object.values(record).flatMap((value) => {
		const parsed = catalogProviderSchema.safeParse(value)
		return parsed.success && parsed.data.models ? [parsed.data] : []
	})
}

async function fetchCatalog(): Promise<CatalogProvider[]> {
	const url = getOpenAiModelCatalogUrl()

	if (!url) {
		return []
	}

	const cached = catalogCache.get<CatalogProvider[]>(url)

	if (cached) {
		return cached
	}

	if (!inFlightFetch) {
		inFlightFetch = (async () => {
			try {
				const response = await axios.get(url, { timeout: CATALOG_FETCH_TIMEOUT_MS })
				const providers = collectProviders(response.data)
				catalogCache.set(url, providers)
				return providers
			} catch (error) {
				console.error(
					`[ModelCatalog] Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
				)
				return []
			} finally {
				inFlightFetch = undefined
			}
		})()
	}

	return inFlightFetch
}

function selectModel(providers: CatalogProvider[], baseUrl: string | undefined, modelId: string) {
	const normalized = baseUrl ? normalizeUrl(baseUrl) : ""

	const matchesBaseUrl = (provider: CatalogProvider) => {
		const providerBaseUrl = provider.options?.baseURL ? normalizeUrl(provider.options.baseURL) : ""
		if (!normalized || !providerBaseUrl) {
			return false
		}
		return normalized.startsWith(providerBaseUrl) || providerBaseUrl.startsWith(normalized)
	}

	// A manifest may describe several gateways; prefer the entry whose baseURL matches the
	// profile before falling back to any entry that happens to list the model id.
	const preferred = providers.filter(matchesBaseUrl)
	const candidates = preferred.length > 0 ? preferred : providers

	for (const provider of candidates) {
		const model = provider.models?.[modelId]
		if (model) {
			return model
		}
	}

	return undefined
}

function toReasoningEfforts(model: CatalogModel): CatalogReasoningEffort[] | undefined {
	const efforts = Object.values(model.variants ?? {}).flatMap((variant) => {
		const effort = variant?.reasoningEffort
		return !variant?.disabled && effort && reasoningEfforts.includes(effort as CatalogReasoningEffort)
			? [effort as CatalogReasoningEffort]
			: []
	})

	return efforts.length > 0 ? efforts : undefined
}

function toModelInfo(modelId: string, model: CatalogModel): ModelInfo {
	const inputModalities = model.modalities?.input
	const supportsImages = inputModalities ? inputModalities.includes("image") : (model.attachment ?? false)
	const reasoningEffortValues = toReasoningEfforts(model)

	return {
		maxTokens: model.limit?.output,
		contextWindow: model.limit?.context ?? openAiModelInfoSaneDefaults.contextWindow,
		supportsImages,
		supportsPromptCache: false,
		...(typeof model.temperature === "boolean" && { supportsTemperature: model.temperature }),
		...(reasoningEffortValues && { supportsReasoningEffort: reasoningEffortValues }),
		...(model.cost?.input !== undefined && { inputPrice: model.cost.input }),
		...(model.cost?.output !== undefined && { outputPrice: model.cost.output }),
		...(model.cost?.cache_read !== undefined && { cacheReadsPrice: model.cost.cache_read }),
		...(model.cost?.cache_write !== undefined && { cacheWritesPrice: model.cost.cache_write }),
		description: `${model.name ?? modelId}${CATALOG_DESCRIPTION_SUFFIX}`,
	}
}

export async function getOpenAiCatalogModelInfo(
	baseUrl: string | undefined,
	modelId: string,
): Promise<ModelInfo | undefined> {
	if (!isCatalogBaseUrl(baseUrl)) {
		return undefined
	}

	const providers = await fetchCatalog()
	const model = selectModel(providers, baseUrl, modelId)
	return model ? toModelInfo(modelId, model) : undefined
}

function isReplaceable(info: ModelInfo | null | undefined): boolean {
	if (!info) {
		return true
	}

	return info.description?.endsWith(CATALOG_DESCRIPTION_SUFFIX) || deepEqual(info, openAiModelInfoSaneDefaults)
}

/**
 * Returns the settings with `openAiCustomModelInfo` resolved from the catalog.
 *
 * Model info a user edited by hand is left untouched: only unset info, the sane defaults, and
 * previously catalog-provisioned info (identified by the description suffix) get replaced.
 */
export async function withOpenAiCatalogModelInfo<T extends ProviderSettings>(settings: T): Promise<T> {
	console.log("called withOpenAiCatalogModelInfo ...")
	console.log("settings.openAiModelId in withOpenAiCatalogModelInfo: ", settings.openAiModelId)

	try {
		if (settings.apiProvider !== providerIdentifiers.openai || !settings.openAiModelId) {
			return settings
		}

		if (!isCatalogBaseUrl(settings.openAiBaseUrl) || !isReplaceable(settings.openAiCustomModelInfo)) {
			return settings
		}

		const info = await getOpenAiCatalogModelInfo(settings.openAiBaseUrl, settings.openAiModelId)

		if (!info || deepEqual(settings.openAiCustomModelInfo, info)) {
			return settings
		}

		return { ...settings, openAiCustomModelInfo: info }
	} catch (error) {
		console.error(
			`[ModelCatalog] Failed to resolve model info: ${error instanceof Error ? error.message : String(error)}`,
		)
		return settings
	}
}

/**
 * Refreshes the model info of every stored OpenAI-Compatible profile.
 *
 * `withOpenAiCatalogModelInfo` covers profiles as they are saved; this covers profiles that were
 * configured before the catalog was available and are not otherwise touched again.
 */
export async function syncOpenAiCatalogProfiles(provider: ClineProvider): Promise<void> {
	console.log("Called syncOpenAiCatalogProfiles...")

	if (!getOpenAiModelCatalogUrl()) {
		return
	}

	const activeProfileName = provider.contextProxy.getValues().currentApiConfigName
	console.log("activeProfileName: ", activeProfileName)
	const entries = await provider.providerSettingsManager.listConfig()

	for (const entry of entries.filter(({ apiProvider }) => apiProvider === providerIdentifiers.openai)) {
		const profile = await provider.providerSettingsManager.getProfile({ name: entry.name })
		const updated = await withOpenAiCatalogModelInfo(profile)

		console.log("profile in syncOpenAiCatalogProfiles: ", profile)
		console.log("updated profile: ", updated)

		if (updated === profile) {
			continue
		}

		if (entry.name === activeProfileName) {
			// Route the active profile through upsert so the in-memory settings and the webview
			// pick up the refreshed capabilities without a reload.
			await provider.upsertProviderProfile(entry.name, updated, true)
		} else {
			await provider.providerSettingsManager.saveConfig(entry.name, updated)
		}
	}
}
/**
 * Fetch the model info when user changes model from the dropdown under OpenAI comapotible.tsx
 *
 */

export async function fetchOpenAiCatalogInfoOnModelChange(
	provider: ClineProvider,
	selectedModelId: string | undefined,
): Promise<void> {
	if (!getOpenAiModelCatalogUrl()) {
		return
	}

	const activeProfileName = provider.contextProxy.getValues().currentApiConfigName
	const entries = await provider.providerSettingsManager.listConfig()

	for (const entry of entries.filter(({ apiProvider }) => apiProvider === providerIdentifiers.openai)) {
		const profile = await provider.providerSettingsManager.getProfile({ name: entry.name })
		// The profile on disk still holds the previous model id (Save hasn't run yet), so
		// override it with the newly selected id before resolving catalog capabilities —
		// otherwise the catalog lookup uses the stale id and returns outdated info.
		profile.openAiModelId = selectedModelId

		const updated = await withOpenAiCatalogModelInfo(profile)

		if (entry.name === activeProfileName) {
			// Route the active profile through upsert so the in-memory settings and the webview
			// pick up the refreshed capabilities without a reload.
			await provider.upsertProviderProfile(entry.name, updated, true)
			// Push the resolved capabilities to the webview so the form (which reads from
			// cachedState, isolated from extensionState per AGENTS.md) can merge them in
			// and update ModelInfoView without a reload. This also ensures the next Save
			// persists the resolved info, since handleSubmit sends cachedState.apiConfiguration.
			if (updated.openAiCustomModelInfo) {
				await provider.postMessageToWebview({
					type: "openAiCatalogModelInfo",
					modelInfo: updated.openAiCustomModelInfo,
				})
			}
		} else {
			await provider.providerSettingsManager.saveConfig(entry.name, updated)
		}
	}
}
