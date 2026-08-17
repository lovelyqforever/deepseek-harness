window.__ModuleLoader__.load({
  id: "dsh-mcp",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    const css = [
      ".dsmcp_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}",
      ".dsmcp_hint{margin:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:10px;padding:10px 14px;font-size:13px;line-height:20px}",
      ".dsmcp_error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}",
      ".dsmcp_list{flex-direction:column;gap:10px;display:flex}",
      ".dsmcp_row{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dsmcp_meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}",
      ".dsmcp_name{font-size:14px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsmcp_sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
      ".dsmcp_dot{background:var(--dsw-alias-label-tertiary);border-radius:999px;width:7px;height:7px;display:inline-block;margin-right:6px}",
      ".dsmcp_dot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}",
      ".dsmcp_dot[data-state=connecting]{background:var(--dsw-alias-state-warn-primary)}",
      ".dsmcp_toggle{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;white-space:nowrap}",
      ".dsmcp_toggle:disabled{opacity:.5;cursor:default}",
      ".dsmcp_toggle[aria-pressed=true]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}",
    ].join("");

    async function apiList() {
      const res = await fetch("/mcp/manager/list", { cache: "no-store" });
      if (!res.ok) throw new Error("list failed: " + res.status);
      return await res.json();
    }
    async function apiSet(id, enabled) {
      const res = await fetch("/mcp/manager/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("set failed: " + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "set failed");
      return data;
    }

    function statusOf(s) {
      if (s.enabled === false) return { state: "off", text: "已停用" };
      if (s.connected) return { state: "connected", text: "已连接" };
      if (s.running) return { state: "connecting", text: "连接中…" };
      return { state: "off", text: "未运行" };
    }

    function McpSection() {
      const [state, setState] = react.useState({ status: "loading" });
      const [busy, setBusy] = react.useState(new Set());
      const [failed, setFailed] = react.useState(false);

      const load = react.useCallback(() => {
        setState({ status: "loading" });
        apiList().then(
          (s) => setState({ status: "ready", snapshot: s }),
          () => setState({ status: "error" }),
        );
      }, []);

      const refresh = react.useCallback(() => {
        apiList().then(
          (s) => setState({ status: "ready", snapshot: s }),
          () => {},
        );
      }, []);

      react.useEffect(() => {
        load();
        const timer = setInterval(refresh, 2000);
        return () => clearInterval(timer);
      }, [load, refresh]);

      const toggle = (s) => {
        if (busy.has(s.id)) return;
        setBusy((prev) => { const n = new Set(prev); n.add(s.id); return n; });
        setFailed(false);
        apiSet(s.id, !s.enabled).then(() => {
          setState((prev) => {
            if (prev.status !== "ready") return prev;
            const servers = prev.snapshot.servers.map((x) =>
              x.id === s.id ? { ...x, enabled: !s.enabled } : x);
            return { status: "ready", snapshot: { ...prev.snapshot, servers } };
          });
        }).catch(() => setFailed(true)).finally(() => {
          setBusy((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
        });
      };

      return react.createElement("div", { className: "dsmcp_section" },
        react.createElement("style", null, css),
        react.createElement("p", { className: "dsmcp_hint" }, "配置源：项目根 mcp.yaml（增删 server 请编辑该文件；此处只做启停）"),
        state.status === "loading" ? react.createElement("p", { className: "dsmcp_hint" }, "正在读取…") : null,
        state.status === "error" ? react.createElement("p", { className: "dsmcp_error" }, "读取失败，请刷新或检查 mcp.yaml") : null,
        failed ? react.createElement("p", { className: "dsmcp_error" }, "操作失败，请重试") : null,
        state.status === "ready" ? react.createElement("div", { className: "dsmcp_list" },
          (state.snapshot.servers || []).map((s) => {
            const st = statusOf(s);
            return react.createElement("div", { className: "dsmcp_row", key: s.id },
              react.createElement("div", { className: "dsmcp_meta" },
                react.createElement("div", { className: "dsmcp_name" },
                  react.createElement("span", { className: "dsmcp_dot", "data-state": st.state }),
                  s.serverName,
                ),
                react.createElement("div", { className: "dsmcp_sub" },
                  s.transport + " · " + st.text + " · mcp__" + s.serverName + "__*"),
              ),
              react.createElement("button", {
                className: "dsmcp_toggle",
                onClick: () => toggle(s),
                disabled: busy.has(s.id),
                "aria-pressed": s.enabled ? "true" : "false",
              }, s.enabled ? "停用" : "启用"),
            );
          }),
        ) : null,
      );
    }

    const NS = "settings.mcpManager";
    const inject = ["slots", "locale"];

    const zh = { nav: "MCP 管理" };
    const en = { nav: "MCP Management" };

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-mcp: dictionaries");
      const t = ctx.locale.bind(NS);
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "mcp",
        order: 30,
        label: () => t("nav"),
        locale: NS,
        inject: () => ({}),
      }, McpSection));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
