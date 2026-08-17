window.__ModuleLoader__.load({
  id: "dsh-plugin-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    // 视觉对齐「插件列表」：折叠卡片 = 插件名 + 启用/停用 tag + 下拉箭头；
    // 点击展开后才显示「包名 / 版本」基础信息 + 启用/禁用开关。
    // 所有带 width+padding 的元素都显式 box-sizing:border-box，杜绝右侧被裁。
    const css = [
      ".dspm_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}",
      ".dspm_status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
      ".dspm_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}",
      ".dspm_failure p{margin:0}",
      ".dspm_failure button{appearance:none;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}",
      ".dspm_hint{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:10px;padding:10px 14px;font-size:13px;line-height:20px;margin:0}",
      ".dspm_catalog{flex-direction:column;gap:12px;display:flex}",
      ".dspm_search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}",
      ".dspm_search>svg{pointer-events:none;position:absolute;left:12px;top:50%;transform:translateY(-50%)}",
      ".dspm_search input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}",
      ".dspm_search input::placeholder{color:var(--dsw-alias-label-tertiary)}",
      ".dspm_search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}",
      ".dspm_catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}",
      ".dspm_catalogHeading h3{margin:0;font-size:13px;font-weight:600;line-height:20px}",
      ".dspm_catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}",
      ".dspm_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}",
      ".dspm_card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}",
      ".dspm_card[data-open=true]{border-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1)}",
      ".dspm_cardContent{appearance:none;box-sizing:border-box;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:10px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dspm_cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}",
      ".dspm_cardTitle{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:14px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}",
      ".dspm_cardTrailing{align-items:center;gap:8px;flex:none;display:flex}",
      ".dspm_statusDot{background:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block}",
      ".dspm_statusDot[data-enabled=true]{background:var(--dsw-alias-state-success-primary)}",
      ".dspm_configTag{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}",
      ".dspm_configTag[data-enabled=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}",
      ".dspm_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s;display:flex}",
      ".dspm_card[data-open=true] .dspm_chevron{transform:rotate(180deg)}",
      ".dspm_cardDetails{border-top:1px solid var(--dsw-alias-border-l2);padding:12px 16px;flex-direction:column;gap:10px;display:flex}",
      ".dspm_details{margin:0;flex-direction:column;gap:6px;display:flex}",
      ".dspm_detailRow{align-items:baseline;gap:8px;display:flex;font-size:12px;line-height:18px}",
      ".dspm_detailRow dt{color:var(--dsw-alias-label-tertiary);flex:none;min-width:44px;font-weight:400}",
      ".dspm_detailRow dd{margin:0;min-width:0;flex:1}",
      ".dspm_entryValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}",
      ".dspm_toggleRow{align-items:center;justify-content:space-between;gap:12px;display:flex}",
      ".dspm_toggleLabel{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}",
      ".dspm_switch{appearance:none;border:none;background:0 0;padding:0;cursor:pointer;flex:none;display:inline-flex}",
      ".dspm_switch:disabled{opacity:.4;cursor:default}",
      ".dspm_track{box-sizing:border-box;width:36px;height:20px;border-radius:999px;background:transparent;border:1px solid var(--dsw-alias-label-tertiary);position:relative;transition:background .16s,border-color .16s}",
      ".dspm_switch[aria-checked=true] .dspm_track{background:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}",
      ".dspm_knob{width:14px;height:14px;border-radius:999px;background:var(--dsw-alias-label-primary);position:absolute;top:3px;left:3px;transition:transform .16s;box-shadow:0 1px 2px rgba(0,0,0,.3)}",
      ".dspm_switch[aria-checked=true] .dspm_knob{transform:translateX(16px)}",
      ".dspm_switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:999px}",
      // 更新：黄点 + 「待更新」tag + 更新按钮 + 检查更新按钮
      ".dspm_statusDot[data-update=true]{background:var(--dsw-alias-state-warn-primary,#e6a23c)}",
      ".dspm_configTag[data-update=true]{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#e6a23c) 12%, transparent);color:var(--dsw-alias-state-warn-primary,#e6a23c)}",
      ".dspm_updateBtn{appearance:none;box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary,#e6a23c) 30%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#e6a23c) 12%, transparent);color:var(--dsw-alias-state-warn-primary,#e6a23c);font:inherit;font-size:12px;line-height:1.5;cursor:pointer;border-radius:6px;padding:3px 12px}",
      ".dspm_updateBtn:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#e6a23c) 20%, transparent);border-color:var(--dsw-alias-state-warn-primary,#e6a23c)}",
      ".dspm_updateBtn:disabled{opacity:.4;cursor:default}",
      ".dspm_refresh{appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1.5;cursor:pointer;border-radius:6px;padding:3px 10px;margin-left:auto;flex:none}",
      ".dspm_refresh:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}",
      ".dspm_refresh:disabled{opacity:.4;cursor:default}",
    ].join("");

    const tagId = "dsh-plugin-manager/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-manager";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // —— 与宿主半通信 ——
    async function apiList() {
      const res = await fetch("/plugins/plugin-manager/list", { cache: "no-store" });
      if (!res.ok) throw new Error("list failed: " + res.status);
      return await res.json();
    }
    async function apiSet(name, enabled) {
      const res = await fetch("/plugins/plugin-manager/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled }),
      });
      if (!res.ok) throw new Error("set failed: " + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "set failed");
      return data;
    }
    async function apiCheck() {
      const res = await fetch("/plugins/plugin-manager/check", { cache: "no-store" });
      if (!res.ok) throw new Error("check failed: " + res.status);
      return await res.json();
    }
    async function apiUpdate(name) {
      const res = await fetch("/plugins/plugin-manager/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("update failed: " + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "update failed");
      return data;
    }

    function shortName(moduleName) {
      return (moduleName.startsWith("@") ? moduleName.slice(moduleName.indexOf("/") + 1) : moduleName)
        .replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(?:host-|client-)?/, "");
    }

    function SearchIcon() {
      return react.createElement("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
        react.createElement("circle", { cx: 7, cy: 7, r: 4.5, stroke: "currentColor", strokeWidth: 1.5 }),
        react.createElement("path", { d: "M10.5 10.5L14 14", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })
      );
    }

    function ChevronIcon(props) {
      return react.createElement("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", "aria-hidden": true, className: props.className },
        react.createElement("path", { d: "M3 4.5L6 7.5L9 4.5", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
      );
    }

    function Switch(props) {
      return react.createElement("button", {
        type: "button",
        className: "dspm_switch",
        role: "switch",
        "aria-checked": props.checked ? "true" : "false",
        "aria-label": props.label,
        title: props.label,
        disabled: props.disabled,
        onClick: props.onClick,
      },
        react.createElement("span", { className: "dspm_track" },
          react.createElement("span", { className: "dspm_knob" })
        )
      );
    }

    // 展开状态与「已改动」提示持久化到 sessionStorage：禁用某插件会触发宿主重挂载
    // 设置页，若不记住，下拉区会收起、开关随之消失，导致无法再启用。
    function readPersistedUI() {
      try {
        if (typeof sessionStorage !== "undefined") {
          const raw = sessionStorage.getItem("dsh-plugin-manager:ui");
          if (raw) {
            const v = JSON.parse(raw);
            return { expanded: v.expanded ?? null, dirty: !!v.dirty };
          }
        }
      } catch {}
      return { expanded: null, dirty: false };
    }
    function writePersistedUI(patch) {
      try {
        if (typeof sessionStorage !== "undefined") {
          const cur = readPersistedUI();
          sessionStorage.setItem("dsh-plugin-manager:ui", JSON.stringify({ ...cur, ...patch }));
        }
      } catch {}
    }

    function PluginManagerTab({ t, list, setEnabled, check, update }) {
      const catalogId = react.useId();
      const [query, setQuery] = react.useState("");
      const [state, setState] = react.useState({ status: "loading" });
      const [expanded, setExpanded] = react.useState(() => readPersistedUI().expanded);
      const [busy, setBusy] = react.useState(new Set());
      const [updating, setUpdating] = react.useState(new Set());
      const [checking, setChecking] = react.useState(false);
      const [dirty, setDirty] = react.useState(() => readPersistedUI().dirty);
      const [failed, setFailed] = react.useState(false);

      const load = react.useCallback(() => {
        setState({ status: "loading" });
        Promise.resolve().then(() => list()).then((snapshot) => {
          setState({ status: "ready", snapshot });
        }, () => {
          setState({ status: "error" });
        });
      }, [list]);

      react.useEffect(() => { load(); }, [load]);

      const normalizedQuery = query.trim().toLocaleLowerCase();
      const entries = state.status === "ready" ? state.snapshot.plugins : [];
      const filtered = entries.filter((p) => normalizedQuery.length === 0 || p.name.toLocaleLowerCase().includes(normalizedQuery));

      react.useEffect(() => {
        if (state.status === "ready" && expanded !== null && !filtered.some((p) => p.name === expanded)) setExpanded(null);
      }, [expanded, filtered, state.status]);

      react.useEffect(() => {
        writePersistedUI({ expanded, dirty });
      }, [expanded, dirty]);

      const toggle = (p) => {
        if (busy.has(p.name)) return;
        setBusy((prev) => { const n = new Set(prev); n.add(p.name); return n; });
        setFailed(false);
        setEnabled(p.name, !p.enabled).then(() => {
          setState((prev) => {
            if (prev.status !== "ready") return prev;
            const plugins = prev.snapshot.plugins.map((x) => x.name === p.name ? { ...x, enabled: !p.enabled } : x);
            return { status: "ready", snapshot: { ...prev.snapshot, plugins } };
          });
          setDirty(true);
        }).catch(() => {
          setFailed(true);
        }).finally(() => {
          setBusy((prev) => { const n = new Set(prev); n.delete(p.name); return n; });
        });
      };

      const doUpdate = (p) => {
        if (updating.has(p.name)) return;
        setUpdating((prev) => { const n = new Set(prev); n.add(p.name); return n; });
        setFailed(false);
        update(p.name).then((data) => {
          setState((prev) => {
            if (prev.status !== "ready") return prev;
            const plugins = prev.snapshot.plugins.map((x) => x.name === p.name ? { ...x, version: data.version, latest: null } : x);
            return { status: "ready", snapshot: { ...prev.snapshot, plugins } };
          });
          setDirty(true);
        }).catch(() => {
          setFailed(true);
        }).finally(() => {
          setUpdating((prev) => { const n = new Set(prev); n.delete(p.name); return n; });
        });
      };

      const doCheck = () => {
        if (checking) return;
        setChecking(true);
        setFailed(false);
        check().then((snapshot) => {
          setState({ status: "ready", snapshot });
        }).catch(() => {
          setFailed(true);
        }).finally(() => {
          setChecking(false);
        });
      };

      return react.createElement("div", { className: "dspm_section", "aria-busy": state.status === "loading" },
        state.status === "loading" ? react.createElement("p", { className: "dspm_status" }, t("loading")) : null,
        state.status === "error" ? react.createElement("div", { className: "dspm_failure" },
          react.createElement("p", { role: "alert" }, t("error")),
          react.createElement("button", { type: "button", onClick: load }, t("retry"))
        ) : null,
        failed ? react.createElement("p", { className: "dspm_status", style: { color: "var(--dsw-alias-state-error-primary)" } }, t("saveFailed")) : null,
        dirty ? react.createElement("p", { className: "dspm_hint", role: "status" }, t("restartHint")) : null,
        state.status === "ready" ? react.createElement("div", { className: "dspm_catalog" },
          react.createElement("label", { className: "dspm_search" },
            react.createElement(SearchIcon),
            react.createElement("input", {
              type: "search",
              value: query,
              placeholder: t("search"),
              "aria-label": t("search"),
              onChange: (e) => setQuery(e.currentTarget.value),
            })
          ),
          react.createElement("div", { className: "dspm_catalogHeading" },
            react.createElement("h3", null, t("catalog")),
            react.createElement("span", { "data-plugin-count": filtered.length }, String(filtered.length)),
            react.createElement("button", {
              type: "button",
              className: "dspm_refresh",
              disabled: checking,
              onClick: doCheck,
            }, checking ? t("checkingUpdates") : t("refreshUpdates"))
          ),
          entries.length === 0 ? react.createElement("p", { className: "dspm_status" }, t("empty")) : null,
          entries.length > 0 && filtered.length === 0 ? react.createElement("p", { className: "dspm_status" }, t("emptySearch")) : null,
          filtered.length > 0 ? react.createElement("ul", { className: "dspm_cards" },
            filtered.map((p) => {
              const title = shortName(p.name);
              const hasUpdate = !!p.latest;
              const tag = hasUpdate ? t("updateTag") : (p.enabled ? t("enabledTag") : t("disabledTag"));
              const open = expanded === p.name;
              const detailId = catalogId + "-details-" + encodeURIComponent(p.name);
              const switchLabel = (p.enabled ? t("disable") : t("enable")) + " " + p.name;
              return react.createElement("li", {
                className: "dspm_card",
                key: p.name,
                "data-plugin-entry": p.name,
                "data-open": open ? "true" : void 0,
              },
                react.createElement("button", {
                  className: "dspm_cardContent",
                  type: "button",
                  "aria-expanded": open,
                  "aria-controls": detailId,
                  onClick: () => setExpanded((cur) => (cur === p.name ? null : p.name)),
                },
                  react.createElement("strong", { className: "dspm_cardTitle", title: p.name }, title),
                  react.createElement("span", { className: "dspm_cardTrailing" },
                    react.createElement("span", { className: "dspm_statusDot", "data-update": hasUpdate ? "true" : void 0, "data-enabled": hasUpdate ? void 0 : (p.enabled ? "true" : "false") }),
                    react.createElement("span", { className: "dspm_configTag", "data-update": hasUpdate ? "true" : void 0, "data-enabled": hasUpdate ? void 0 : (p.enabled ? "true" : "false") }, tag),
                    react.createElement(ChevronIcon, { className: "dspm_chevron" })
                  )
                ),
                open ? react.createElement("div", { className: "dspm_cardDetails", id: detailId },
                  react.createElement("dl", { className: "dspm_details" },
                    react.createElement("div", { className: "dspm_detailRow" },
                      react.createElement("dt", null, t("package")),
                      react.createElement("dd", { className: "dspm_entryValue" }, p.name)
                    ),
                    react.createElement("div", { className: "dspm_detailRow" },
                      react.createElement("dt", null, t("version")),
                      react.createElement("dd", { className: "dspm_entryValue" }, p.version || "—")
                    ),
                    hasUpdate ? react.createElement("div", { className: "dspm_detailRow" },
                      react.createElement("dt", null, t("latestVersion")),
                      react.createElement("dd", { className: "dspm_entryValue" }, p.latest)
                    ) : null
                  ),
                  hasUpdate ? react.createElement("div", { className: "dspm_toggleRow" },
                    react.createElement("span", { className: "dspm_toggleLabel" }, t("updateAction")),
                    react.createElement("button", {
                      type: "button",
                      className: "dspm_updateBtn",
                      disabled: updating.has(p.name),
                      onClick: () => doUpdate(p),
                    }, updating.has(p.name) ? t("updating") : (t("updateAction") + " → " + p.latest))
                  ) : react.createElement("div", { className: "dspm_toggleRow" },
                    react.createElement("span", { className: "dspm_toggleLabel" }, t("toggle")),
                    react.createElement(Switch, {
                      checked: p.enabled,
                      disabled: busy.has(p.name),
                      label: switchLabel,
                      onClick: () => toggle(p),
                    })
                  )
                ) : null
              );
            })
          ) : null
        ) : null
      );
    }

    const NS = "settings.pluginManager";
    const inject = ["slots", "locale"];

    const zh = {
      tab: "插件管理",
      loading: "正在读取插件…",
      error: "暂时无法读取插件。",
      retry: "重试",
      search: "搜索插件",
      catalog: "插件管理",
      empty: "没有可管理的插件。",
      emptySearch: "没有匹配的插件。",
      enabledTag: "已启用",
      disabledTag: "已停用",
      updateTag: "待更新",
      enable: "启用",
      disable: "停用",
      package: "包名",
      version: "版本",
      latestVersion: "最新版本",
      toggle: "启用/停用",
      updateAction: "更新",
      updating: "更新中…",
      refreshUpdates: "检查更新",
      checkingUpdates: "检查中…",
      restartHint: "改动已保存，重启 exe 后生效。",
      saveFailed: "操作失败，请重试。",
    };
    const en = {
      tab: "Plugin Management",
      loading: "Reading plugins…",
      error: "Plugins are temporarily unavailable.",
      retry: "Retry",
      search: "Search plugins",
      catalog: "Plugin Management",
      empty: "No manageable plugins.",
      emptySearch: "No matching plugins.",
      enabledTag: "Enabled",
      disabledTag: "Disabled",
      updateTag: "Update available",
      enable: "Enable",
      disable: "Disable",
      package: "Package",
      version: "Version",
      latestVersion: "Latest",
      toggle: "Enable / Disable",
      updateAction: "Update",
      updating: "Updating…",
      refreshUpdates: "Check updates",
      checkingUpdates: "Checking…",
      restartHint: "Changes saved. Restart the app to apply.",
      saveFailed: "Operation failed, please retry.",
    };

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-manager: dictionaries");
      const t = ctx.locale.bind(NS);
      const injected = () => ({ list: apiList, setEnabled: apiSet, check: apiCheck, update: apiUpdate });
      ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
        name: "settings.plugins.tab",
        id: "manage",
        order: 20,
        label: () => t("tab"),
        locale: NS,
        inject: injected,
      }, PluginManagerTab));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
