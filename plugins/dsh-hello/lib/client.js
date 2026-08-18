window.__ModuleLoader__.load({
  id: "dsh-hello",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    // 外观完全对齐「插件配置」现有三张卡（PluginCard + ValueField）。
    const css = [
      ".dshello_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
      ".dshello_card:hover{border-color:var(--dsw-alias-label-dimmed)}",
      ".dshello_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshello_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dshello_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".dshello_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
      ".dshello_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
      ".dshello_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dshello_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s;display:flex}",
      ".dshello_chevronOpen{transform:rotate(180deg)}",
      ".dshello_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
      ".dshello_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
      ".dshello_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
      ".dshello_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
      ".dshello_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}",
      ".dshello_discard,.dshello_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
      ".dshello_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
      ".dshello_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshello_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted)}",
      ".dshello_discard:disabled,.dshello_save:disabled{opacity:.4;cursor:default}",
      ".dshello_discard:focus-visible,.dshello_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
      ".dshello_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
      ".dshello_fieldHead{align-items:center;gap:8px;display:flex}",
      ".dshello_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
      ".dshello_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}",
      ".dshello_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".dshello_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".dshello_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dshello_banner{position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;background:var(--dsw-alias-bg-layer-3,#1f2328);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 14px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);box-shadow:0 4px 16px rgba(0,0,0,.25)}",
    ].join("");

    const tagId = "dsh-hello/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-hello";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // 问候语状态：配置卡和右下角横幅共享同一个 settings 命名空间 scope（rc.7 契约）。
    // scope 在 apply 里通过 ctx.settingsScope.bind({ namespace: "hello" }) 绑定，
    // 读写都走 settingsScope，由宿主 settings 层负责跨重启持久化。
    let scope = null;

    function useScopeSnapshot() {
      const [snap, setSnap] = react.useState(scope ? scope.getSnapshot() : { status: "loading" });
      react.useEffect(function () {
        if (!scope) return undefined;
        setSnap(scope.getSnapshot());
        return scope.subscribe(function () { setSnap(scope.getSnapshot()); });
      }, []);
      return snap;
    }

    function greetingOf(snap) {
      if (!snap || snap.status !== "ready") return "";
      const v = snap.value;
      return v && typeof v.greeting === "string" ? v.greeting : "";
    }

    function useGreeting() {
      return greetingOf(useScopeSnapshot());
    }

    function Chevron(props) {
      return react.createElement("span", { className: "dshello_chevron" + (props.open ? " dshello_chevronOpen" : "") },
        react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": true },
          react.createElement("path", { d: "M3.5 5.25L7 8.75L10.5 5.25", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
        )
      );
    }

    // 配置卡（对齐 PluginCard）：标题 + 描述 + 折叠 + 输入框 + 保存/放弃。
    function HelloCard() {
      const saved = useGreeting();
      const [open, setOpen] = react.useState(false);
      const [draft, setDraft] = react.useState(null); // null = 未编辑
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);

      const current = saved === null ? "" : saved;
      const staged = draft === null ? current : draft;
      const dirty = draft !== null && draft.trim() !== current;

      return react.createElement("li", { className: "dshello_card" + (open ? " dshello_cardOpen" : "") },
        react.createElement("button", {
          type: "button",
          className: "dshello_header",
          "aria-expanded": open,
          onClick: function () { setOpen(!open); },
        },
          react.createElement("span", { className: "dshello_headText" },
            react.createElement("span", { className: "dshello_name" }, "问候语"),
            react.createElement("span", { className: "dshello_description" }, "自定义页面显示的问候语文案。")
          ),
          dirty ? react.createElement("span", { className: "dshello_pending" }, "未保存") : null,
          react.createElement(Chevron, { open: open })
        ),
        open ? react.createElement("div", { className: "dshello_body" },
          react.createElement("div", { className: "dshello_field" },
            react.createElement("div", { className: "dshello_fieldHead" },
              react.createElement("label", { className: "dshello_label", htmlFor: "plugin-config-hello-greeting" }, "问候语")
            ),
            react.createElement("input", {
              id: "plugin-config-hello-greeting",
              className: "dshello_input",
              type: "text",
              value: staged,
              placeholder: "输入要显示的问候语",
              disabled: saving,
              onChange: function (event) { setDraft(event.target.value); },
            }),
            react.createElement("p", { className: "dshello_hint" }, "保存后页面会实时显示这段文案，重启后依然保留。")
          ),
          react.createElement("div", { className: "dshello_footer" },
            failed ? react.createElement("p", { className: "dshello_failed", role: "status" }, "保存失败") : null,
            react.createElement("button", {
              type: "button",
              className: "dshello_discard",
              disabled: !dirty || saving,
              onClick: function () { setDraft(null); },
            }, "放弃修改"),
            react.createElement("button", {
              type: "button",
              className: "dshello_save",
              disabled: !dirty || saving,
              onClick: function () {
                const value = draft.trim();
                setSaving(true);
                setFailed(false);
                scope.set("greeting", value).then(function () {
                  setSaving(false);
                  setDraft(null);
                }).catch(function () {
                  setSaving(false);
                  setFailed(true);
                });
              },
            }, saving ? "保存中" : "保存")
          )
        ) : null
      );
    }

    // 显示位：页面右下角浮层横幅，实时显示问候语。
    function GreetingBanner() {
      const greeting = useGreeting();
      if (!greeting) return null;
      return react.createElement("div", { className: "dshello_banner" },
        react.createElement("span", null, greeting)
      );
    }

    const inject = ["slots", "settingsScope"];

    function apply(ctx) {
      // 绑定 hello 命名空间 scope：配置卡读写 + 横幅显示共用。
      scope = ctx.settingsScope.bind({ namespace: "hello" });

      // 配置卡 → 设置 → 插件 → 插件配置（rc.7 keyed：key = 命名空间）
      ctx.slots.inject("settings.plugin.item", function () {
        return ctx.slots.register({
          name: "settings.plugin.item",
          key: "hello",
        }, HelloCard);
      });

      // 显示位 → 页面右下角浮层
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "hello-greeting",
          order: 100,
        }, GreetingBanner);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
