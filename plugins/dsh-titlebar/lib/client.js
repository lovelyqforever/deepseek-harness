// dsh-titlebar 前端：无边框窗口的自绘标题栏。
// - 仅在 Electron 桌面壳下渲染（检测 window.desktop 桥接，WebUI 下跳过）。
// - 顶部 32px 拖拽区 + 右侧最小化/最大化/关闭三按钮。
// - 完全用 --dsw-alias-* 主题 token 上色，跟随深浅色；后续自定义背景也一起变。
(function () {
  "use strict";

  if (!window.desktop) return; // 非桌面壳（浏览器 WebUI）不渲染

  var HEIGHT = 32;

  var ICONS = {
    minimize:
      '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>',
    maximize:
      '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
    restore:
      '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
    close:
      '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>',
  };

  function injectStyle() {
    if (document.getElementById("dsh-titlebar-style")) return;
    var css = [
      "#dsh-titlebar{position:fixed;top:0;left:0;right:0;height:" + HEIGHT + "px;z-index:2000;display:flex;align-items:center;box-sizing:border-box;padding-left:12px;background:var(--dsw-alias-bg-base,#0f1115);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));-webkit-app-region:drag;user-select:none;}",
      "#dsh-titlebar .dsh-tb-title{font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#9aa0ab);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      "#dsh-titlebar .dsh-tb-controls{margin-left:auto;display:flex;align-self:stretch;-webkit-app-region:no-drag;}",
      "#dsh-titlebar .dsh-tb-btn{width:46px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0ab);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}",
      "#dsh-titlebar .dsh-tb-btn:hover{background:var(--dsw-alias-bg-module-platform,rgba(128,128,128,.15));color:var(--dsw-alias-label-primary,#fff);}",
      "#dsh-titlebar .dsh-tb-btn.dsh-tb-close:hover{background:#e81123;color:#fff;}",
      "body{padding-top:" + HEIGHT + "px !important;box-sizing:border-box !important;}",
    ].join("\n");
    var style = document.createElement("style");
    style.id = "dsh-titlebar-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function build() {
    var bar = document.createElement("div");
    bar.id = "dsh-titlebar";

    var title = document.createElement("div");
    title.className = "dsh-tb-title";
    title.textContent = "DeepSeek Harness";

    var controls = document.createElement("div");
    controls.className = "dsh-tb-controls";

    function btn(cls, action, icon, label) {
      var b = document.createElement("button");
      b.className = "dsh-tb-btn" + (cls ? " " + cls : "");
      b.setAttribute("data-action", action);
      b.setAttribute("title", label);
      b.setAttribute("aria-label", label);
      b.innerHTML = icon;
      return b;
    }

    var btnMin = btn("", "minimize", ICONS.minimize, "最小化");
    var btnMax = btn("", "maximize", ICONS.maximize, "最大化");
    var btnClose = btn("dsh-tb-close", "close", ICONS.close, "关闭");

    btnMin.addEventListener("click", function () {
      window.desktop.minimize();
    });
    btnMax.addEventListener("click", function () {
      window.desktop.toggleMaximize();
    });
    btnClose.addEventListener("click", function () {
      window.desktop.close();
    });

    function setMaxIcon(max) {
      btnMax.innerHTML = max ? ICONS.restore : ICONS.maximize;
      btnMax.setAttribute("title", max ? "还原" : "最大化");
      btnMax.setAttribute("aria-label", max ? "还原" : "最大化");
    }
    try {
      setMaxIcon(!!window.desktop.isMaximized());
      if (typeof window.desktop.onMaximizeChange === "function") {
        window.desktop.onMaximizeChange(setMaxIcon);
      }
    } catch (e) {}

    controls.appendChild(btnMin);
    controls.appendChild(btnMax);
    controls.appendChild(btnClose);
    bar.appendChild(title);
    bar.appendChild(controls);
    return bar;
  }

  function mount() {
    if (document.getElementById("dsh-titlebar")) return;
    injectStyle();
    document.body.appendChild(build());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
