import { InMemoryCredentialStore, type Model, type Provider } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { ModelRuntime } from "../src/core/model-runtime.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => {
	const provider = (id: string): Provider => {
		const model: Model<"openai-completions"> = {
			id: `${id}-model`,
			name: `${id} model`,
			api: "openai-completions",
			provider: id,
			baseUrl: "http://127.0.0.1:9/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 4096,
			maxTokens: 256,
		};

		return {
			id,
			name: id,
			auth: { apiKey: { name: `${id} API key`, resolve: async () => undefined } },
			getModels: () => [model],
			stream: () => {
				throw new Error("stream not used by provider allowlist tests");
			},
			streamSimple: () => {
				throw new Error("streamSimple not used by provider allowlist tests");
			},
		};
	};

	return {
		builtinProviders: () => [provider("anthropic"), provider("openai")],
		builtinModels: () => ({
			getProvider: () => undefined,
			stream: () => {
				throw new Error("stream not used by provider allowlist tests");
			},
			streamSimple: () => {
				throw new Error("streamSimple not used by provider allowlist tests");
			},
		}),
		getBuiltinModel: () => undefined,
		getBuiltinModels: () => [],
		getBuiltinProviders: () => ["anthropic", "openai"],
		getBuiltinModelDataGeneratedAt: () => undefined,
		radiusProvider: () => provider("radius"),
	};
});

const credentials = () => new InMemoryCredentialStore();

describe("ModelRuntime provider allowlist", () => {
	it("keeps the legacy built-in provider behavior when omitted", async () => {
		const runtime = await ModelRuntime.create({
			credentials: credentials(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
		});

		expect(runtime.getProviders().length).toBeGreaterThan(0);
	});

	it("can start with no providers", async () => {
		const runtime = await ModelRuntime.create({
			credentials: credentials(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
			providerAllowlist: [],
		});

		expect(runtime.getProviders()).toEqual([]);
		expect(runtime.getModels()).toEqual([]);
	});

	it("loads only allowlisted built-in providers", async () => {
		const runtime = await ModelRuntime.create({
			credentials: credentials(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
			providerAllowlist: ["anthropic"],
		});

		expect(runtime.getProviders().map((provider) => provider.id)).toEqual(["anthropic"]);
	});

	it("allows a deliberately registered provider and rejects other providers", async () => {
		const runtime = await ModelRuntime.create({
			credentials: credentials(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
			providerAllowlist: ["tokendance-gateway"],
		});

		runtime.registerProvider("tokendance-gateway", {
			name: "Tokendance Gateway",
			baseUrl: "http://127.0.0.1:9/v1",
			api: "openai-completions",
			apiKey: "test-placeholder",
			models: [
				{
					id: "tkd-test-model",
					name: "TKD Test Model",
					reasoning: false,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 4096,
					maxTokens: 256,
				},
			],
		});

		expect(runtime.getProviders().map((provider) => provider.id)).toEqual(["tokendance-gateway"]);
		expect(runtime.getModel("tokendance-gateway", "tkd-test-model")?.provider).toBe("tokendance-gateway");
		expect(() => runtime.registerProvider("anthropic", { baseUrl: "http://127.0.0.1:9/v1" })).toThrow(
			"not allowed by this runtime's providerAllowlist",
		);
		expect(() =>
			runtime.registerNativeProvider({
				id: "openai",
				name: "OpenAI",
				auth: { apiKey: { name: "OpenAI API key", resolve: async () => undefined } },
				getModels: () => [],
				stream: () => {
					throw new Error("stream not used by provider allowlist tests");
				},
				streamSimple: () => {
					throw new Error("streamSimple not used by provider allowlist tests");
				},
			}),
		).toThrow("not allowed by this runtime's providerAllowlist");
	});
});
