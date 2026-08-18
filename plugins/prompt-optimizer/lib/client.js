/**
 * prompt-optimizer — Client half (static web bundle).
 *
 * Registered through the package's `dsh.client` declaration and served as
 * `/plugins/prompt-optimizer/client.js` by the client-modules service. This is
 * the static-plugin format: `window.__ModuleLoader__.load({ id, factory })`,
 * where the factory receives a `require` for registered browser modules.
 *
 * The bundle registers the ✨ "optimize prompt" button in the composer tool
 * row (`conversation.input.right`, just left of the send button):
 *
 *   - idle:   monochrome sparkles SVG (three four-point stars, ✨ shape)
 *   - busy:   monochrome hourglass SVG while the rewrite is streaming
 *   - hover:  CSS tooltip "优化提示词" (or "优化中…" / "优化失败：<reason>")
 *
 * On click it reads the current draft plus the last 8 messages of the
 * conversation as context, calls the Host endpoint `promptOptimizer/optimize`
 * over the raw connection RPC carrier (`connection.rpc.call("/api", ...)`),
 * and writes the optimized prompt back into the composer via
 * inputActions.setDraft. Errors are surfaced in the tooltip AND logged to the
 * browser console.
 *
 * TRANSPORT NOTE: dsh Client `remote.<namespace>` services are installed ONLY
 * from compiler-generated Typert contributions via `ctx.remote.$mount(...)`;
 * there is no dynamic namespace discovery and no Proxy fallback. A hand-written
 * static plugin therefore cannot obtain `ctx.remote.promptOptimizer` — that
 * inject key is undefined and would throw in apply(), white-screening the page.
 * The Host half still registers `promptOptimizer/optimize` through the
 * gateway's SRC-marker discovery (TypertRemoteService + Remote("optimize")),
 * which the gateway claims via remoteMethods(); this Client half reaches the
 * same endpoint over the raw RPC carrier with the wire shape the gateway's
 * SRC descriptor expects: payload { args: { args: { text, context } } }.
 */
window.__ModuleLoader__.load({
  id: "prompt-optimizer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    /** Required services: slot registry and the RPC carrier. */
    const inject = ["slots", "connection"];

    /**
     * Client plugin body.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
     */
    function apply(ctx) {
      ctx.slots.inject("conversation.input.right", () => {
        const dispose = ctx.slots.register(
          { name: "conversation.input.right", id: "prompt-optimizer" },
          (props) => {
            // InputZone owner props: point-in-time snapshots re-rendered for us.
            const input = props.input;
            const inputActions = props.inputActions;
            const session = props.session;
            const draft = input && typeof input.draft === "string" ? input.draft : "";

            const [busy, setBusy] = react.useState(false);
            const [error, setError] = react.useState("");
            const disabled = busy || draft.trim().length === 0;

            /**
             * Build a compact transcript of the last 8 messages for context.
             * Returns '' in a fresh session, in which case the Host optimizes
             * from the prompt alone.
             */
            const collectContext = () => {
              const lines = [];
              if (session && Array.isArray(session.nodes) && session.nodes.length > 0) {
                const recent = session.nodes.slice(-8);
                for (const node of recent) {
                  if (!node || typeof node !== "object") continue;
                  if (node.kind === "user" && Array.isArray(node.content)) {
                    const text = node.content.filter((b) => b && b.type === "text").map((b) => b.text).join(" ").trim();
                    if (text) lines.push("用户: " + text);
                  } else if (node.kind === "assistant" && Array.isArray(node.blocks)) {
                    const text = node.blocks.filter((b) => b && b.kind === "text").map((b) => b.text).join(" ").trim();
                    if (text) lines.push("助手: " + text);
                  }
                }
              }
              let context = lines.join("\n");
              if (context.length > 4000) context = context.slice(-4000);
              return context;
            };

            const onClick = async () => {
              if (disabled) return;
              setBusy(true);
              setError("");
              try {
                // Direct RPC to the Host SRC-marked endpoint. Wire shape:
                // { args: { args: { text, context } } } — the outer args is the
                // RPC envelope, the inner one is the Host method's parameter.
                const result = await ctx.connection.rpc.call(
                  "/api",
                  "promptOptimizer/optimize",
                  { args: { args: { text: draft, context: collectContext() } } }
                );
                // result: { ok: true, value: { ok: true, text } } | { ok: false, error }
                const inner = result && result.ok ? result.value : null;
                if (inner && inner.ok && typeof inner.text === "string" && inner.text.length > 0) {
                  if (inputActions && typeof inputActions.setDraft === "function") inputActions.setDraft(inner.text);
                } else {
                  const msg = (result && !result.ok && result.error && result.error.message)
                    ? result.error.message
                    : (inner && inner.error ? String(inner.error) : "优化失败");
                  setError(msg);
                  console.error("[prompt-optimizer]", msg);
                }
              } catch (err) {
                setError("优化失败");
                console.error("[prompt-optimizer]", err);
              } finally {
                setBusy(false);
              }
            };

            // Monochrome icons (fill: currentColor): idle — sparkles (✨ shape),
            // busy — hourglass.
            const icon = react.createElement(
              "svg",
              { width: 14, height: 14, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
              react.createElement("path", { d: busy
                ? "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6z"
                : "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" })
            );

            return react.createElement(
              "button",
              {
                type: "button",
                className: "dsh-prompt-optimizer-btn",
                disabled,
                onClick,
                "data-tip": error ? "优化失败：" + error : (busy ? "优化中…" : "优化提示词"),
                "aria-label": error ? "优化失败：" + error : (busy ? "优化中" : "优化提示词"),
                title: error ? "优化失败：" + error : undefined,
              },
              icon
            );
          }
        );
        return () => {
          dispose();
        };
      });

      // Toolbar-aligned styles: 28x28 round button, 14px monochrome icon,
      // same hover/disabled tokens as the built-in row; tooltip on hover.
      const css = [
        ".dsh-prompt-optimizer-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:999px;cursor:pointer;flex:none;place-items:center;transition:color .15s,background .15s;user-select:none}",
        ".dsh-prompt-optimizer-btn svg{display:block}",
        ".dsh-prompt-optimizer-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid)}",
        ".dsh-prompt-optimizer-btn:disabled{opacity:.5;cursor:default}",
        ".dsh-prompt-optimizer-btn::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(2px);padding:4px 8px;font-size:12px;line-height:1.4;white-space:nowrap;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:opacity .12s ease,transform .12s ease;z-index:10}",
        ".dsh-prompt-optimizer-btn:hover::after{opacity:1;transform:translateX(-50%) translateY(0)}",
      ].join("\n");
      const styleId = "prompt-optimizer-css";
      if (typeof document !== "undefined" && !document.getElementById(styleId)) {
        const tag = document.createElement("style");
        tag.id = styleId;
        tag.textContent = css;
        document.head.appendChild(tag);
      }
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
