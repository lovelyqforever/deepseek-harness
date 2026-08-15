// dsh-quota 前端小部件：显示在侧边栏「新会话」按钮上方（1 行 + 进度条，仅 deepseek 订阅）。
// 原理：不往 React 树里插节点；而是给「新会话」按钮加 margin-top 把按钮和下面内容往下推出一行，
// 再用 fixed 定位把组件放进那一行，就不会盖住上面的 DeepSeek logo。
// 外观对齐「新会话」按钮：背景 var(--dsw-alias-button-elevated-fill)、边框 border-l2、圆角 12px。
(function () {
  "use strict";

  // 开发用：监听服务端 SSE，client.js 被修改时自动刷新页面（无需手动重启）
  (function initReloadWatcher() {
    try {
      const source = new EventSource("/plugins/quota/events");
      let pending = false;
      source.onmessage = (event) => {
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (frame && frame.type === "reload" && !pending) {
          pending = true;
          setTimeout(() => location.reload(), 150);
        }
      };
    } catch {}
  })();

  function fmt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0.00";
    return v.toFixed(2);
  }

  function fmtTokens(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
    return String(Math.round(v));
  }

  // 只取 deepseek 订阅，取不到就退回第一个
  function findDeepseek(data) {
    const subs = data.subscriptions || [];
    return (
      subs.find((s) => /deepseek/i.test(s.group_name || "")) ||
      subs[0] ||
      null
    );
  }

  function buildWidget() {
    const el = document.createElement("div");
    el.id = "dsh-quota-widget";
    // 外观对齐「新会话」按钮
    el.setAttribute(
      "style",
      "position:fixed;z-index:100;box-sizing:border-box;" +
        "padding:7px 12px;border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));" +
        "border-radius:12px;background:var(--dsw-alias-button-elevated-fill, rgba(255,255,255,.06));" +
        "color:var(--dsw-alias-label-secondary, #9aa0a6);font-size:11px;line-height:16px;" +
        "display:none;pointer-events:none;",
    );

    // 文字行（居中）
    const text = document.createElement("div");
    text.style.cssText =
      "display:flex;justify-content:space-between;align-items:baseline;gap:16px;line-height:16px;white-space:nowrap;";
    text.innerHTML = '<span style="opacity:.7">额度加载中…</span>';
    el.appendChild(text);

    // 进度条
    const track = document.createElement("div");
    track.style.cssText =
      "height:4px;margin-top:6px;border-radius:999px;overflow:hidden;" +
      "background:var(--dsw-alias-border-l2, rgba(128,128,128,.25));";
    const fill = document.createElement("div");
    fill.style.cssText =
      "height:100%;width:0%;border-radius:999px;background:var(--dsw-alias-brand-primary, #5686fe);transition:width .3s ease;";
    track.appendChild(fill);
    el.appendChild(track);

    el._text = text;
    el._fill = fill;
    return el;
  }

  function render(el, data) {
    const ds = findDeepseek(data);
    if (!ds) {
      el._text.innerHTML = '<span style="opacity:.7">暂无额度</span>';
      return;
    }
    const today = Number(ds.daily_used_usd || 0);
    const used = Number(ds.monthly_used_usd || 0);
    const limit = Number(ds.monthly_limit_usd || 0);
    const tokenText = fmtTokens(Number(data.daily_tokens || 0));
    el._text.innerHTML =
      '<span>今日 <b style="color:var(--dsw-alias-label-primary,#e8eaed);font-weight:600;">' +
      fmt(today) + "$</b>" +
      (tokenText ? ' · ' + tokenText + " tokens" : "") +
      "</span>" +
      '<span><b style="color:var(--dsw-alias-label-primary,#e8eaed);font-weight:600;">' +
      fmt(used) + '</b> / <b style="color:var(--dsw-alias-label-primary,#e8eaed);font-weight:600;">' +
      fmt(limit) + "$</b></span>";
    // 进度条：已用 / 总额度
    const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
    el._fill.style.width = pct.toFixed(1) + "%";
  }

  // 「新会话」按钮：品牌按钮(DeepSeek logo)和它共用同一个 aria-label，
  // 取「最靠下」的那个（logo 在上、新会话按钮在下；折叠时只有一个）。
  function findButton() {
    const btns = document.querySelectorAll(
      'button[aria-label="新建会话"], button[aria-label="New session"]',
    );
    let best = null;
    let bestTop = -Infinity;
    for (let i = 0; i < btns.length; i++) {
      const r = btns[i].getBoundingClientRect();
      if (r.height > 0 && r.top >= bestTop) {
        best = btns[i];
        bestTop = r.top;
      }
    }
    return best;
  }

  // logoRow = 品牌按钮(DeepSeek logo)的父级
  function findLogoRow() {
    const brand = document.querySelector(
      'button[aria-label="新建会话"], button[aria-label="New session"]',
    );
    return brand && brand.parentElement ? brand.parentElement : null;
  }

  function position() {
    if (!widget) return;
    const btn = findButton();
    if (!btn) {
      widget.style.display = "none";
      return;
    }
    const r = btn.getBoundingClientRect();
    // 折叠成窄条时按钮很窄、放不下：隐藏组件，并还原按钮间距
    if (r.width < 120 || r.height < 1) {
      widget.style.display = "none";
      if (btn.style.marginTop) btn.style.marginTop = "";
      return;
    }

    // 不可见地测出组件高度
    widget.style.display = "";
    widget.style.visibility = "hidden";
    const h = widget.offsetHeight;

    // 给按钮加 margin-top，把按钮（和下面内容）往下推出一行空间
    const GAP = 6;
    btn.style.marginTop = h + GAP * 2 + "px";
    const r2 = btn.getBoundingClientRect();

    // 放进空出的那行；若空隙更大则上下居中
    let top = r2.top - GAP - h;
    const logoRow = findLogoRow();
    if (logoRow) {
      const lb = logoRow.getBoundingClientRect().bottom;
      const gap = r2.top - lb;
      if (gap > h + GAP * 2) top = lb + (gap - h) / 2;
    }

    widget.style.left = r2.left + "px";
    widget.style.top = top + "px";
    widget.style.width = r2.width + "px";
    widget.style.visibility = "";
  }

  async function fetchQuota() {
    try {
      const res = await fetch("/plugins/quota/data", { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      return j && !j.error ? j : null;
    } catch (e) {
      return null;
    }
  }

  let widget = null;
  let data = null;

  async function refresh() {
    const d = await fetchQuota();
    if (d) {
      data = d;
      if (widget) render(widget, data);
    }
  }

  function ensure() {
    if (!widget) {
      widget = buildWidget();
      document.body.appendChild(widget);
    }
    position();
  }

  function start() {
    refresh();
    setInterval(refresh, 60000);
    ensure();
    // 定期校正位置/宽度（侧边栏折叠、窗口缩放等）
    setInterval(position, 500);
    window.addEventListener("resize", position);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
