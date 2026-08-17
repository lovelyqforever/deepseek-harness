// ============================================================================
// dsh-session-archiver — 客户端半（跑在浏览器里）
//
// 在设置面板里新增一个「归档对话」节（settings.section 插槽），
// 位置在「Agent 预设」（order 20）之后（order 21）。
// 该节列出所有已归档会话，每条一个「取消归档」按钮。
//
// 数据通过宿主半的两个 webServer 端点读写：
//   GET  /plugins/session-archiver/list       —— 拉取归档会话列表
//   POST /plugins/session-archiver/unarchive  —— 取消归档某会话
//
// 注意：客户端半是纯 JS（不做 TS/JSX/import 转译）；React 用 createElement。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-session-archiver",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    // --------------------------------------------------------------------------
    // 文案（zh / en）
    // --------------------------------------------------------------------------
    const NS = "settings.sessionArchives";
    const inject = ["slots", "locale"];

    const zh = {
      nav: "归档对话",
      title: "已归档的对话",
      intro: "这里是你归档过的会话；取消归档后，它会重新出现在对应工作区的侧边栏里。",
      loading: "正在读取归档会话…",
      error: "暂时无法读取归档会话。",
      retry: "重试",
      empty: "当前没有已归档的会话。",
      unarchive: "取消归档",
      unarchiving: "正在取消归档…",
      unarchiveFailed: "取消归档失败，请重试。",
    };
    const en = {
      nav: "Archived chats",
      title: "Archived conversations",
      intro: "Conversations you have archived. Unarchiving returns one to its workspace sidebar.",
      loading: "Reading archived conversations…",
      error: "Archived conversations are temporarily unavailable.",
      retry: "Retry",
      empty: "No archived conversations yet.",
      unarchive: "Unarchive",
      unarchiving: "Unarchiving…",
      unarchiveFailed: "Unarchive failed, please retry.",
    };

    // --------------------------------------------------------------------------
    // 样式：注入一次 <style>，全部用主题 token，自适应明暗主题。
    // --------------------------------------------------------------------------
    const CSS = `
.dsa_section{box-sizing:border-box;max-width:640px;padding:0 4px}
.dsa_title{margin:0 0 6px;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsa_intro{margin:0 0 16px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dsa_status{font-size:13px;color:var(--dsw-alias-label-tertiary)}
.dsa_empty{margin:16px 0 0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.dsa_failure{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:16px 0 0}
.dsa_failure p{margin:0;font-size:13px;color:var(--dsw-alias-state-error-primary)}
.dsa_retry{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
.dsa_retry:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.dsa_list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.dsa_row{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.dsa_meta{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsa_name{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa_when{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsa_cwd{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa_unarchive{box-sizing:border-box;flex:none;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
.dsa_unarchive:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.dsa_unarchive:disabled{opacity:.4;cursor:default}
`;
    let cssInjected = false;
    function ensureCss() {
      if (cssInjected) return;
      cssInjected = true;
      const style = document.createElement("style");
      style.setAttribute("data-plugin", "dsh-session-archiver");
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // --------------------------------------------------------------------------
    // 工具函数：时间戳格式化、路径取末段（用于展示所属工作区目录名）
    // --------------------------------------------------------------------------
    function formatTime(v) {
      if (v == null) return "";
      const n = typeof v === "number" ? v : Date.parse(v);
      if (!Number.isFinite(n)) return "";
      return new Date(n).toLocaleString();
    }
    function basename(p) {
      if (typeof p !== "string" || p.length === 0) return "";
      const parts = p.split(/[\\/]/);
      return parts[parts.length - 1] || p;
    }

    // --------------------------------------------------------------------------
    // 归档会话节组件（settings.section 的一个条目）
    // 收到的 props：t（由 locale 字段提供）+ list / unarchive（由 inject 提供）
    // --------------------------------------------------------------------------
    function SessionArchiveSection({ t, list, unarchive }) {
      const [state, setState] = react.useState({ status: "loading" });
      const [busy, setBusy] = react.useState(new Set());
      const [failed, setFailed] = react.useState(false);

      const load = react.useCallback(() => {
        setState({ status: "loading" });
        Promise.resolve()
          .then(() => list())
          .then((snapshot) => {
            setState({ status: "ready", sessions: snapshot.sessions || [] });
          }, () => {
            setState({ status: "error" });
          });
      }, [list]);

      react.useEffect(() => { load(); }, [load]);

      const onUnarchive = (s) => {
        if (busy.has(s.id)) return;
        setBusy((prev) => { const n = new Set(prev); n.add(s.id); return n; });
        setFailed(false);
        unarchive(s.id).then(() => {
          // 从当前列表里移除已取消归档的会话。
          setState((prev) => {
            if (prev.status !== "ready") return prev;
            return { status: "ready", sessions: prev.sessions.filter((x) => x.id !== s.id) };
          });
        }).catch(() => {
          setFailed(true);
        }).finally(() => {
          setBusy((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
        });
      };

      const sessions = state.status === "ready" ? state.sessions : [];

      return react.createElement("div", { className: "dsa_section", "aria-busy": state.status === "loading" },
        react.createElement("h2", { className: "dsa_title" }, t("title")),
        react.createElement("p", { className: "dsa_intro" }, t("intro")),
        state.status === "loading" ? react.createElement("p", { className: "dsa_status" }, t("loading")) : null,
        state.status === "error"
          ? react.createElement("div", { className: "dsa_failure" },
              react.createElement("p", { role: "alert" }, t("error")),
              react.createElement("button", { type: "button", className: "dsa_retry", onClick: load }, t("retry")))
          : null,
        failed ? react.createElement("p", { className: "dsa_status", style: { color: "var(--dsw-alias-state-error-primary)" } }, t("unarchiveFailed")) : null,
        state.status === "ready" && sessions.length === 0
          ? react.createElement("p", { className: "dsa_empty" }, t("empty"))
          : null,
        state.status === "ready" && sessions.length > 0
          ? react.createElement("ul", { className: "dsa_list" },
              sessions.map((s) => react.createElement("li", { className: "dsa_row", key: s.id },
                react.createElement("div", { className: "dsa_meta" },
                  react.createElement("span", { className: "dsa_name", title: s.title }, s.title),
                  react.createElement("span", { className: "dsa_when" }, formatTime(s.createdAt)),
                  s.cwd ? react.createElement("span", { className: "dsa_cwd" }, basename(s.cwd)) : null
                ),
                react.createElement("button", {
                  type: "button",
                  className: "dsa_unarchive",
                  disabled: busy.has(s.id),
                  onClick: () => onUnarchive(s),
                }, busy.has(s.id) ? t("unarchiving") : t("unarchive"))
              ))
          )
          : null
      );
    }

    // --------------------------------------------------------------------------
    // 宿主端点封装（浏览器原生 fetch）
    // --------------------------------------------------------------------------
    function apiList() {
      return fetch("/plugins/session-archiver/list").then((r) => {
        if (!r.ok) throw new Error("list failed");
        return r.json();
      }).then((d) => {
        if (!d || d.ok !== true) throw new Error("list failed");
        return d;
      });
    }
    function apiUnarchive(sessionId) {
      return fetch("/plugins/session-archiver/unarchive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).then((r) => {
        if (!r.ok) throw new Error("unarchive failed");
        return r.json();
      }).then((d) => {
        if (!d || d.ok !== true) throw new Error("unarchive failed");
        return d;
      });
    }

    // --------------------------------------------------------------------------
    // apply：注册文案 + 注册 settings.section 条目
    // --------------------------------------------------------------------------
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-session-archiver: dictionaries");
      ensureCss();
      const t = ctx.locale.bind(NS);
      const injected = () => ({ list: apiList, unarchive: apiUnarchive });
      // order 21 = 紧跟「Agent 预设」（order 20）之后。
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "session-archives",
        order: 21,
        label: () => t("nav"),
        locale: NS,
        inject: injected,
      }, SessionArchiveSection));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
