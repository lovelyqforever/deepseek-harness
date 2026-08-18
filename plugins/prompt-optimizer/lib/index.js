/**
 * prompt-optimizer — Host half (static Cordis plugin).
 *
 * Registers the `promptOptimizer` Remote service with one method, `optimize`,
 * which rewrites the user's draft prompt with an LLM so it is clearer, more
 * specific and more effective. The model route is resolved with a fallback
 * chain so the feature keeps working even when no default model is configured:
 *
 *   1. agentDefaultModel.currentSelection()  — the configured default
 *   2. llm.listProviders()[0] + llm.listModels()[0] — first available route
 *
 * Unlike the dynamic-plugin variant (which used harness.handle / host.call),
 * this static plugin exposes a Typert Remote service so the browser Client
 * half can call it through the shared RPC carrier (ctx.remote.promptOptimizer).
 *
 * Remote method `optimize`:
 *   input:  { text: string, context?: string }
 *   output: { ok: true, text: string } | { ok: false, error: string }
 */
import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/**
 * Minimal TS-decorator emulation: `Remote(name)` returns a method decorator
 * whose context must expose `addInitializer` (Stage-3 decorator contract).
 * The initializer runs at instance creation and marks the prototype so the
 * Typert Gateway can discover the method as a Remote export.
 */
function decorateMethod(decorator, method, methodName, prototype) {
  const initializers = [];
  const context = {
    kind: "method",
    name: methodName,
    static: false,
    private: false,
    addInitializer(fn) {
      initializers.push(fn);
    },
  };
  decorator(method, context);
  // Stage-3 initializers run once per instance after construction; here we
  // only need the side effect once, against the shared prototype.
  for (const init of initializers) init.call({ __proto__: prototype });
}

/** @type {import('@deepseek-ai/cordis').Plugin} */
export default {
  inject: ["llm"],
  apply(ctx) {
    // agentDefaultModel is optional — the fallback chain covers its absence.
    const agentDefaultModel = ctx.get("agentDefaultModel");

    /**
     * Resolve a usable provider/model route.
     * @returns {{ provider: string, model: string, reasoningEffort?: string } | undefined}
     */
    const resolveSelection = async () => {
      if (agentDefaultModel) {
        try {
          const s = agentDefaultModel.currentSelection();
          if (s && s.provider && s.model) return s;
        } catch (e) {
          console.error("[prompt-optimizer] currentSelection failed", e);
        }
      }
      const providers = ctx.llm.listProviders();
      if (!providers || providers.length === 0) return undefined;
      const provider = providers[0].id;
      try {
        const models = await ctx.llm.listModels(provider);
        if (models && models.length > 0) return { provider, model: models[0].id };
      } catch (e) {
        console.error("[prompt-optimizer] listModels failed", e);
      }
      return { provider, model: undefined };
    };

    const service = new (class PromptOptimizerService extends TypertRemoteService {
      /**
       * Rewrite one draft prompt with the LLM.
       * @param {{ text?: unknown, context?: unknown }} args
       */
      async optimize(args) {
        try {
          // --- Validate input -------------------------------------------------
          const text = (args && typeof args === "object" && typeof args.text === "string" ? args.text : "").trim();
          if (!text) return { ok: false, error: "empty" };
          const context = args && typeof args === "object" && typeof args.context === "string" ? args.context.trim() : "";

          // --- Resolve the model route (with fallback) -------------------------
          const selection = await resolveSelection();
          if (!selection || !selection.provider || !selection.model) {
            return { ok: false, error: "no-model" };
          }

          // --- Assemble the optimization request -------------------------------
          const system = [
            "你是一位专业的提示词工程专家。你的任务是把用户给出的提示词改写得更清晰、更具体、更有效，使其能引导 AI 产出高质量结果。",
            "改写前请先仔细阅读提供的\"对话上下文\"（若有），理解用户当前正在进行的任务和真实意图，确保优化后的提示词与用户意图一致、贴合对话内容，避免偏离主题。若没有上下文，直接基于提示词本身优化。",
            "优化时请遵循：",
            "1. 保留用户的原始意图，不改变核心需求；",
            "2. 参考对话上下文，补充缺失的关键背景（角色、目标、约束）；",
            "3. 将模糊的要求具体化，明确输入、输出与格式；",
            "4. 需要时拆分为清晰的步骤。",
            "使用与原始提示词相同的语言。只输出优化后的提示词本身，不要任何解释、前言、引号或 Markdown 代码块包裹。",
          ].join("\n");

          const framedInput = context
            ? "对话上下文（供理解用户意图）：\n" + context + "\n\n---\n\n用户要求优化的提示词：\n" + text
            : "用户要求优化的提示词：\n" + text;

          const message = {
            id: "prompt-optimize-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
            role: "user",
            content: [{ type: "text", text: framedInput }],
            source: { kind: "plugin", plugin: "prompt-optimizer" },
          };

          const options = {
            provider: selection.provider,
            model: selection.model,
            messages: [message],
            system,
            maxTokens: 2048,
          };
          if (selection.reasoningEffort) options.reasoningEffort = selection.reasoningEffort;

          // --- Stream the rewrite ----------------------------------------------
          // Only text-delta chunks are accumulated. block-end carries the fully
          // assembled block, so summing it as well would duplicate the output.
          let out = "";
          let terminal = null;
          for await (const chunk of ctx.llm.stream(options)) {
            if (chunk.type === "text-delta") out += chunk.text;
            else if (chunk.type === "finish") terminal = chunk.reason;
          }

          // --- Map terminal finish reasons to errors ---------------------------
          if (terminal) {
            if (terminal.kind === "error" || terminal.kind === "aborted") {
              return { ok: false, error: terminal.failure ? terminal.failure.message : "llm-error" };
            }
            if (terminal.kind === "max-tokens") return { ok: false, error: "max-tokens" };
            if (terminal.kind === "tool-calls") return { ok: false, error: "tool-calls" };
          }

          const optimized = out.trim();
          if (!optimized) return { ok: false, error: "empty-result" };
          return { ok: true, text: optimized };
        } catch (error) {
          console.error("[prompt-optimizer] optimize failed", error);
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    })(ctx, "promptOptimizer");

    // Mark `optimize` as a Remote export on the service prototype so the
    // Typert Gateway exposes it as `remote.promptOptimizer.optimize(...)`.
    decorateMethod(Remote("optimize"), service.optimize, "optimize", Object.getPrototypeOf(service));
  },
};
