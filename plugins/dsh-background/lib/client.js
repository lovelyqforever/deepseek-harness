window.__ModuleLoader__.load({
  id: "dsh-background",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    // =====================================================================
    // CSS（配置卡外观对齐内置「插件配置」卡片；背景层/透明化单独注入）
    // =====================================================================
    const css = [
      ".dsbg_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
      ".dsbg_card:hover{border-color:var(--dsw-alias-label-dimmed)}",
      ".dsbg_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".dsbg_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dsbg_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".dsbg_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
      ".dsbg_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
      ".dsbg_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dsbg_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s;display:flex}",
      ".dsbg_chevronOpen{transform:rotate(180deg)}",
      ".dsbg_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
      ".dsbg_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
      ".dsbg_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
      ".dsbg_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}",
      ".dsbg_discard,.dsbg_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
      ".dsbg_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
      ".dsbg_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
      ".dsbg_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted)}",
      ".dsbg_discard:disabled,.dsbg_save:disabled{opacity:.4;cursor:default}",
      ".dsbg_discard:focus-visible,.dsbg_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
      ".dsbg_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
      ".dsbg_fieldHead{align-items:center;gap:8px;display:flex}",
      ".dsbg_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
      ".dsbg_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dsbg_preview{width:100%;max-width:280px;max-height:150px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;display:block;margin:4px 0 0}",
      ".dsbg_current{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:1.5;word-break:break-all}",
      ".dsbg_browse{display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font-size:13px;line-height:1.5}",
      ".dsbg_browse:hover{border-color:var(--dsw-alias-label-dimmed)}",
    ].join("");

    const tagId = "dsh-background/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-background";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // 有背景时注入的透明化（让所有不透明面板透出底层背景图）。做成可开关，清除背景时移除。
    // 取长补短：套一层 body[data-dsh-background] 作用域（学官方皮肤的隔离做法）——
    // 只有背景激活时才生效，不污染其它皮肤/插件；同时仍保留「一刀切全部背景透明」的覆盖力，
    // 只动「背景颜色」这一个属性，不碰文字颜色，所以文字不会消失。
    // 文字可读性（自适应压暗层）是独立后续步骤，本规则不处理。
    const TRANSPARENCY_CSS =
      "body[data-dsh-background] *{background-color:transparent!important}";

    function setTransparency(on) {
      const id = "dsh-background-transparency";
      let tag = document.getElementById(id);
      if (on) {
        if (!document.body.hasAttribute("data-dsh-background")) {
          document.body.setAttribute("data-dsh-background", "");
        }
        if (!tag) {
          tag = document.createElement("style");
          tag.id = id;
          tag.textContent = TRANSPARENCY_CSS;
          document.head.appendChild(tag);
        }
      } else {
        document.body.removeAttribute("data-dsh-background");
        if (tag) tag.remove();
      }
    }

    // =====================================================================
    // 背景源注册表（可扩展）：以后加 css-wave / canvas / webgl / video 只加一个模块
    // =====================================================================
    const providers = {
      image: {
        id: "image",
        label: "图片",
        fileFilter: "image/png,image/jpeg,image/webp,image/gif",
        needsFile: true,
        apply(layer, opts) {
          layer.style.backgroundImage = 'url("' + opts.url + '")';
          layer.style.backgroundSize = "cover";
          layer.style.backgroundPosition = "center";
          layer.style.backgroundRepeat = "no-repeat";
        },
        clear(layer) {
          layer.style.backgroundImage = "";
          layer.style.backgroundSize = "";
          layer.style.backgroundPosition = "";
          layer.style.backgroundRepeat = "";
        },
      },
    };

    // =====================================================================
    // 背景层 + 状态 store（配置卡与背景层共享，通过 fetch 读写宿主端点）
    // =====================================================================
    function ensureLayer() {
      let el = document.getElementById("dsh-background-layer");
      if (!el) {
        el = document.createElement("div");
        el.id = "dsh-background-layer";
        el.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;";
        const body = document.body || document.documentElement;
        body.insertBefore(el, body.firstChild);
      }
      return el;
    }

    function applyDom(s) {
      const layer = ensureLayer();
      const provider = providers[s && s.provider];
      if (provider) provider.apply(layer, s);
      setTransparency(true);
    }

    function clearDom() {
      const layer = document.getElementById("dsh-background-layer");
      if (layer) {
        for (const key in providers) providers[key].clear(layer);
      }
      setTransparency(false);
    }

    let state = null; // { provider, file, url } 或 null（未设置）
    let loaded = false;
    let loading = null;
    const listeners = new Set();

    function setState(v) {
      state = v;
      loaded = true;
      listeners.forEach((l) => l());
    }
    function subscribe(l) {
      listeners.add(l);
      return function () { listeners.delete(l); };
    }
    function loadState() {
      if (loading) return loading;
      loading = (async function () {
        try {
          const res = await fetch("/plugins/background/state", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            setState(data && data.provider ? data : null);
          }
        } catch (e) {}
        loading = null;
      })();
      return loading;
    }
    async function saveImage(dataUrl) {
      const res = await fetch("/plugins/background/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: dataUrl }),
      });
      if (!res.ok) throw new Error("save failed: " + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      setState({ provider: data.provider, file: data.file, url: data.url });
      applyDom(data);
      return data;
    }
    async function clearBackground() {
      const res = await fetch("/plugins/background/clear", { method: "POST" });
      if (!res.ok) throw new Error("clear failed: " + res.status);
      await res.json();
      setState(null);
      clearDom();
    }
    function useBackground() {
      const [v, setV] = react.useState(state);
      react.useEffect(function () {
        setV(state);
        if (!loaded) loadState();
        return subscribe(function () { setV(state); });
      }, []);
      return v;
    }

    // =====================================================================
    // 配置卡
    // =====================================================================
    function Chevron(props) {
      return react.createElement("span", { className: "dsbg_chevron" + (props.open ? " dsbg_chevronOpen" : "") },
        react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": true },
          react.createElement("path", { d: "M3.5 5.25L7 8.75L10.5 5.25", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
        )
      );
    }

    function BackgroundCard() {
      const saved = useBackground();
      const [open, setOpen] = react.useState(false);
      const [pending, setPending] = react.useState(null); // null | { dataUrl, name }
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);

      const hasCurrent = !!saved;
      const dirty = !!pending;

      function handlePick(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          setPending({ dataUrl: String(reader.result), name: file.name });
          setFailed(false);
        };
        reader.readAsDataURL(file);
      }

      function doSave() {
        if (!pending) return;
        setSaving(true);
        setFailed(false);
        saveImage(pending.dataUrl).then(function () {
          setSaving(false);
          setPending(null);
        }).catch(function () {
          setSaving(false);
          setFailed(true);
        });
      }

      function doClear() {
        setSaving(true);
        setFailed(false);
        clearBackground().then(function () {
          setSaving(false);
          setPending(null);
        }).catch(function () {
          setSaving(false);
          setFailed(true);
        });
      }

      return react.createElement("li", { className: "dsbg_card" + (open ? " dsbg_cardOpen" : "") },
        react.createElement("button", {
          type: "button",
          className: "dsbg_header",
          "aria-expanded": open,
          onClick: function () { setOpen(!open); },
        },
          react.createElement("span", { className: "dsbg_headText" },
            react.createElement("span", { className: "dsbg_name" }, "自定义背景"),
            react.createElement("span", { className: "dsbg_description" }, "设置全屏背景图，保存后立即生效并跨重启保留。")
          ),
          dirty ? react.createElement("span", { className: "dsbg_pending" }, "未保存") : null,
          react.createElement(Chevron, { open: open })
        ),
        open ? react.createElement("div", { className: "dsbg_body" },
          react.createElement("div", { className: "dsbg_field" },
            react.createElement("div", { className: "dsbg_fieldHead" },
              react.createElement("label", { className: "dsbg_label" }, "背景图")
            ),
            hasCurrent ? react.createElement("div", null,
              react.createElement("img", { className: "dsbg_preview", src: saved.url, alt: "当前背景" }),
              react.createElement("p", { className: "dsbg_current" }, "当前：" + saved.file)
            ) : null,
            pending ? react.createElement("img", { className: "dsbg_preview", src: pending.dataUrl, alt: "待保存预览" }) : null,
            react.createElement("label", { className: "dsbg_browse", style: saving ? { opacity: 0.4, pointerEvents: "none" } : null },
              react.createElement("input", {
                type: "file",
                accept: "image/png,image/jpeg,image/webp,image/gif",
                style: { display: "none" },
                disabled: saving,
                onChange: handlePick,
              }),
              "浏览文件…"
            ),
            react.createElement("p", { className: "dsbg_hint" }, "支持 PNG / JPG / WebP / GIF。图片保存在插件目录（D 盘），不占系统盘，重启后自动还原。")
          ),
          react.createElement("div", { className: "dsbg_footer" },
            failed ? react.createElement("p", { className: "dsbg_failed", role: "status" }, "操作失败") : null,
            hasCurrent ? react.createElement("button", { type: "button", className: "dsbg_discard", disabled: saving, onClick: doClear }, "恢复默认") : null,
            dirty ? react.createElement("button", { type: "button", className: "dsbg_discard", disabled: saving, onClick: function () { setPending(null); } }, "放弃修改") : null,
            dirty ? react.createElement("button", { type: "button", className: "dsbg_save", disabled: saving, onClick: doSave }, saving ? "保存中" : "保存") : null
          )
        ) : null
      );
    }

    // =====================================================================
    // 客户端插件 apply
    // =====================================================================
    const inject = ["slots"];

    function apply(ctx) {
      ctx.slots.inject("settings.plugin.item", function () {
        return ctx.slots.register({
          name: "settings.plugin.item",
          id: "background",
          order: 100,
        }, BackgroundCard);
      });

      // 启动时还原背景（不依赖用户打开设置页）
      loadState().then(function () {
        if (state) applyDom(state);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
