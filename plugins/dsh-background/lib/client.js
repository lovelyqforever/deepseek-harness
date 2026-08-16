window.__ModuleLoader__.load({
  id: "dsh-background",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    // =====================================================================
    // CSS（配置卡外观对齐内置「插件配置」卡片；scrim 只作用于我们自己的背景层）
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
      ".dsbg_sliderRow{flex-direction:column;gap:4px;padding:6px 0;display:flex}",
      ".dsbg_sliderHead{justify-content:space-between;align-items:center;gap:8px;display:flex}",
      ".dsbg_sliderLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}",
      ".dsbg_sliderValue{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;font-variant-numeric:tabular-nums}",
      ".dsbg_sliderRow input[type=range]{width:100%;margin:0;accent-color:var(--dsw-alias-brand-primary)}",
      // 压暗层：只叠加在我们自己注入的背景层上，不碰 DSH 任何元素
      "#dsh-background-layer::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,var(--dsbg-scrim,.38));pointer-events:none}",
    ].join("");

    const tagId = "dsh-background/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-background";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // =====================================================================
    // 工具
    // =====================================================================
    function clampNum(v, min, max, def) {
      const n = typeof v === "number" && isFinite(v) ? v : def;
      return Math.min(max, Math.max(min, n));
    }
    function normalizeReadability(r) {
      return {
        scrim: clampNum(r && r.scrim, 0, 0.85, 0.38),
        frostAlpha: clampNum(r && r.frostAlpha, 0.05, 1, 0.6),
        blur: clampNum(r && r.blur, 0, 40, 16),
        edge: clampNum(r && r.edge, 0, 0.6, 0.25),
      };
    }

    // =====================================================================
    // 背景源注册表（可扩展）
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
    // 背景层（z-index 0，铺满；scrim 用 ::after，blur 用 filter）
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

    // =====================================================================
    // 主题 token 覆盖（正确做法）：覆盖 --dsw-alias-* / --dsw-specific-* 让所有
    // 表面 + 按钮 + markdown 代码块半透明，壁纸从 bg-base 透出。overrideTokens 只校验
    // 值是 { light, dark }，不校验 token 名，因此可覆盖 design-platform.css 里的全部 token。
    // =====================================================================
    function buildTokens(r) {
      const a = r.frostAlpha;
      const e = r.edge;
      const over = Math.min(1, a + 0.12);
      const pct = Math.round(a * 100);
      function surf(l, d) { return { light: "rgba(" + l + "," + a + ")", dark: "rgba(" + d + "," + a + ")" }; }
      function border(la, da) { return { light: "rgba(19,45,83," + la + ")", dark: "rgba(148,180,220," + da + ")" }; }
      // 保留原色相、只降透明度：color-mix 引用原始 static/alias token
      function mix(l, d) {
        return {
          light: "color-mix(in srgb, " + l + " " + pct + "%, transparent)",
          dark: "color-mix(in srgb, " + d + " " + pct + "%, transparent)",
        };
      }
      return {
        // —— 底背景磨砂（整个应用画布）：让壁纸透过一层雾，与侧边栏/输入框统一，不再割裂 ——
        "--dsw-alias-bg-base": surf("255,255,255", "12,18,27"),
        // —— 浮层表面：半透明磨砂 ——
        "--dsw-alias-bg-layer-1": surf("255,255,255", "17,26,39"),
        "--dsw-alias-bg-layer-2": surf("236,242,250", "22,33,48"),
        "--dsw-alias-bg-layer-3": surf("236,242,250", "28,38,53"),
        "--dsw-alias-bg-overlay": { light: "rgba(244,248,253," + over + ")", dark: "rgba(17,26,39," + over + ")" },
        "--dsw-alias-bg-module-platform": surf("255,255,255", "17,26,39"),
        "--dsw-alias-bg-multi-select": surf("255,255,255", "22,33,48"),
        // —— 特定表面 ——
        "--dsw-specific-sidebar-fill": surf("244,248,253", "12,18,27"),
        "--dsw-specific-input-major": surf("255,255,255", "17,26,39"),
        "--dsw-specific-login-input": surf("244,248,253", "12,18,27"),
        "--dsw-specific-menu": surf("236,242,250", "28,38,53"),
        "--dsw-specific-selector": surf("244,248,253", "22,33,48"),
        "--dsw-specific-tip": surf("244,248,253", "22,33,48"),
        "--dsw-specific-bubble": surf("236,242,250", "22,33,48"),
        "--dsw-specific-bubble-highlight": surf("244,248,253", "28,38,53"),
        "--dsw-specific-sidebar-nav-item-active": surf("236,242,250", "22,33,48"),
        "--dsw-specific-sidebar-nav-item-hover": surf("236,242,250", "28,38,53"),
        // —— 气泡 / 提示 ——
        "--dsw-alias-toast-bg": surf("255,255,255", "22,33,48"),
        "--dsw-alias-tooltip-bg": surf("255,255,255", "22,33,48"),
        // —— 按钮（保留色相、只降透明度）："新会话" 按钮与余额组件共用 elevated-fill ——
        "--dsw-alias-button-elevated-fill": mix("var(--dsw-static-neutral-bluish-00)", "var(--dsw-static-neutral-bluish-750)"),
        "--dsw-alias-button-floating-fill": mix("var(--dsw-static-neutral-bluish-00)", "var(--dsw-static-neutral-bluish-850)"),
        "--dsw-alias-button-contrast-fill": mix("var(--dsw-static-neutral-bluish-700)", "var(--dsw-static-neutral-bluish-50)"),
        "--dsw-alias-button-primary-fill": mix("var(--dsw-alias-brand-primary)", "var(--dsw-alias-brand-primary)"),
        "--dsw-alias-button-info-fill": mix("var(--dsw-static-deepseek-500)", "var(--dsw-static-deepseek-400)"),
        "--dsw-alias-button-primary-dimmed": mix("var(--dsw-static-neutral-bluish-100)", "var(--dsw-static-neutral-bluish-750)"),
        "--dsw-alias-button-ghost-active-fill": mix("var(--dsw-static-neutral-bluish-100)", "var(--dsw-static-neutral-bluish-750)"),
        // —— markdown 代码块 / 内联代码 / 引用（对话框里的 token 表格等）——
        "--dsw-alias-markdown-code-block": mix("var(--dsw-static-neutral-bluish-50)", "var(--dsw-static-neutral-bluish-900)"),
        "--dsw-alias-markdown-code-block-banner": mix("var(--dsw-static-neutral-bluish-50)", "var(--dsw-static-neutral-bluish-850)"),
        "--dsw-alias-markdown-inline-code": mix("var(--dsw-static-neutral-bluish-100)", "var(--dsw-static-neutral-bluish-850)"),
        "--dsw-alias-markdown-code-segment-selected": mix("var(--dsw-static-neutral-bluish-00)", "var(--dsw-static-neutral-bluish-800)"),
        "--dsw-alias-markdown-code-segment-unselected": mix("var(--dsw-static-neutral-bluish-75)", "var(--dsw-static-neutral-bluish-900)"),
        "--dsw-alias-markdown-tag": mix("var(--dsw-static-neutral-bluish-75)", "var(--dsw-static-neutral-bluish-850)"),
        "--dsw-alias-markdown-citation": mix("var(--dsw-static-neutral-bluish-100)", "var(--dsw-static-neutral-bluish-800)"),
        "--dsw-alias-markdown-placeholder": mix("var(--dsw-static-neutral-bluish-60)", "var(--dsw-static-neutral-bluish-850)"),
        // —— 描边 ——
        "--dsw-alias-border-l1": border(e * 0.5 + 0.02, e * 0.55 + 0.02),
        "--dsw-alias-border-l2": border(e * 0.9 + 0.04, e * 0.95 + 0.04),
        "--dsw-alias-border-l2-darkmode-thin": border(e * 0.7 + 0.03, e * 0.7 + 0.03),
        "--dsw-alias-border-l3": border(e * 1.1 + 0.05, e * 1.1 + 0.05),
        "--dsw-alias-border-l4": border(e * 1.3 + 0.06, e * 1.3 + 0.06),
      };
    }

    let tokenDisposer = null;
    let pluginCtx = null;

    function applyTokens(r) {
      if (!pluginCtx || !pluginCtx.theme || typeof pluginCtx.theme.overrideTokens !== "function") return;
      if (tokenDisposer) { try { tokenDisposer(); } catch (e) {} tokenDisposer = null; }
      try {
        tokenDisposer = pluginCtx.theme.overrideTokens("dsh-background", buildTokens(r));
      } catch (e) {
        console.warn("[dsh-background] overrideTokens failed:", e);
        tokenDisposer = null;
      }
    }
    function clearTokens() {
      if (tokenDisposer) { try { tokenDisposer(); } catch (e) {} tokenDisposer = null; }
    }

    // 把可读性参数落到 DOM：压暗 → 背景层 ::after；模糊 → 背景层 filter；磨砂/描边 → token 覆盖
    function applyReadabilityLive(r) {
      const n = normalizeReadability(r);
      const layer = ensureLayer();
      layer.style.setProperty("--dsbg-scrim", String(n.scrim));
      layer.style.filter = "blur(" + n.blur + "px)";
      applyTokens(n);
    }

    function applyDom(s) {
      const layer = ensureLayer();
      const provider = providers[s && s.provider];
      if (provider) provider.apply(layer, s);
      applyReadabilityLive(s && s.readability);
    }

    function clearDom() {
      const layer = document.getElementById("dsh-background-layer");
      if (layer) {
        for (const key in providers) providers[key].clear(layer);
        layer.style.removeProperty("--dsbg-scrim");
        layer.style.filter = "";
      }
      clearTokens();
    }

    // =====================================================================
    // 状态 store + fetch（与宿主端点通信）
    // =====================================================================
    let state = null;
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
      setState({ provider: data.provider, file: data.file, url: data.url, readability: data.readability });
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
    async function saveReadability(settings) {
      const res = await fetch("/plugins/background/readability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("readability save failed: " + res.status);
      const data = await res.json();
      if (state) setState({ ...state, readability: data.readability });
      return data.readability;
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

    function SliderRow(props) {
      return react.createElement("div", { className: "dsbg_sliderRow" },
        react.createElement("div", { className: "dsbg_sliderHead" },
          react.createElement("span", { className: "dsbg_sliderLabel" }, props.label),
          react.createElement("span", { className: "dsbg_sliderValue" }, props.valueText)
        ),
        react.createElement("input", {
          type: "range",
          min: props.min,
          max: props.max,
          step: props.step,
          value: props.value,
          onChange: function (e) { props.onChange(parseFloat(e.target.value)); },
        })
      );
    }

    function BackgroundCard() {
      const saved = useBackground();
      const [open, setOpen] = react.useState(false);
      const [pending, setPending] = react.useState(null);
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);

      const hasCurrent = !!saved;
      const dirty = !!pending;

      const [readability, setReadability] = react.useState(() => normalizeReadability(saved && saved.readability));
      react.useEffect(function () {
        if (saved) setReadability(normalizeReadability(saved.readability));
      }, [saved]);
      const saveTimer = react.useRef(null);

      function changeReadability(key, value) {
        const next = { ...readability, [key]: value };
        setReadability(next);
        applyReadabilityLive(next);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(function () {
          saveReadability(next).catch(function () {});
        }, 300);
      }

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
          hasCurrent ? react.createElement("div", { className: "dsbg_field" },
            react.createElement("div", { className: "dsbg_fieldHead" },
              react.createElement("label", { className: "dsbg_label" }, "可读性（磨砂）")
            ),
            react.createElement(SliderRow, { label: "压暗深度", valueText: Math.round(readability.scrim * 100) + "%", min: 0, max: 0.85, step: 0.01, value: readability.scrim, onChange: function (v) { changeReadability("scrim", v); } }),
            react.createElement(SliderRow, { label: "磨砂不透明度", valueText: Math.round(readability.frostAlpha * 100) + "%", min: 0.05, max: 1, step: 0.01, value: readability.frostAlpha, onChange: function (v) { changeReadability("frostAlpha", v); } }),
            react.createElement(SliderRow, { label: "模糊强度", valueText: Math.round(readability.blur) + "px", min: 0, max: 40, step: 1, value: readability.blur, onChange: function (v) { changeReadability("blur", v); } }),
            react.createElement(SliderRow, { label: "描边强度", valueText: Math.round(readability.edge * 100) + "%", min: 0, max: 0.6, step: 0.01, value: readability.edge, onChange: function (v) { changeReadability("edge", v); } }),
            react.createElement("p", { className: "dsbg_hint" }, "拖动立即生效并自动保存；数值越大，文字越清楚、面板越实、描边越明显。")
          ) : null,
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
    const inject = ["theme", "slots"];

    function apply(ctx) {
      pluginCtx = ctx;

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
