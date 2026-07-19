import { describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { withModelFallback } from "./model";

interface FakeCall {
  tools?: { type?: string; name?: string }[];
}

function fakeModel(overrides: {
  doGenerate?: (options: unknown) => Promise<unknown>;
  doStream?: (options: unknown) => Promise<unknown>;
}) {
  return {
    specificationVersion: "v2",
    provider: "fake",
    modelId: "fake-model",
    supportedUrls: {},
    doGenerate: overrides.doGenerate ?? (async () => ({ from: "primary" })),
    doStream: overrides.doStream ?? (async () => ({ from: "primary" })),
  } as unknown as LanguageModel;
}

describe("withModelFallback", () => {
  it("uses the primary result when the primary call succeeds", async () => {
    const fallbackGenerate = vi.fn(async () => ({ from: "fallback" }));
    const model = withModelFallback(
      fakeModel({ doGenerate: async () => ({ from: "primary" }) }),
      fakeModel({ doGenerate: fallbackGenerate }),
    ) as unknown as { doGenerate: (options: unknown) => Promise<{ from: string }> };

    const result = await model.doGenerate({});
    expect(result.from).toBe("primary");
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it("retries a failed primary call on the fallback model", async () => {
    const fallbackStream = vi.fn(async () => ({ from: "fallback" }));
    const model = withModelFallback(
      fakeModel({ doStream: async () => { throw new Error("anthropic overloaded"); } }),
      fakeModel({ doStream: fallbackStream }),
    ) as unknown as { doStream: (options: unknown) => Promise<{ from: string }> };

    const result = await model.doStream({});
    expect(result.from).toBe("fallback");
    expect(fallbackStream).toHaveBeenCalledOnce();
  });

  it("strips provider-defined tools from the fallback call but keeps function tools", async () => {
    let received: FakeCall | undefined;
    const model = withModelFallback(
      fakeModel({ doStream: async () => { throw new Error("boom"); } }),
      fakeModel({
        doStream: async (options) => {
          received = options as FakeCall;
          return { from: "fallback" };
        },
      }),
    ) as unknown as { doStream: (options: unknown) => Promise<unknown> };

    await model.doStream({
      tools: [
        { type: "provider-defined", name: "web_search" },
        { type: "function", name: "report_candidate" },
      ],
    });

    expect(received?.tools?.map((tool) => tool.name)).toEqual(["report_candidate"]);
  });
});
