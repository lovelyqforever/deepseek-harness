// dsh-update-check 前端：侧边栏底部「设置」按钮上方显示更新按钮（仅有更新时出现）。
// 原理同 dsh-quota：不往 React 树里插节点，挂到 body 上 + fixed 定位，锚定「设置」触发器。
(function () {
  "use strict";

  const LABELS = ["设置", "Settings"];
  let button = null;
  let state = {
    installed: null,
    latest: null,
    hasUpdate: false,
    updateState: "idle", // idle | updating | done | error
  };

  // 找「设置」触发器：侧边栏底部那个文本为「设置/Settings」的按钮，且在左半屏
  function findTrigger() {
    const btns = document.querySelectorAll("button");
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const text = (b.textContent || "").trim();
      if (LABELS.indexOf(text) >= 0) {
        const r = b.getBoundingClientRect();
        if (r.height > 0 && r.left < window.innerWidth * 0.5) return b;
      }
    }
    return null;
  }

  function build() {
    const el = document.createElement("button");
    el.id = "dsh-update-check-btn";
    el.setAttribute(
      "style",
      "position:fixed;z-index:100;box-sizing:border-box;cursor:pointer;" +
        "display:none;align-items:center;gap:8px;" +
        "padding:7px 12px;border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));" +
        "border-radius:12px;background:var(--dsw-alias-button-elevated-fill, rgba(255,255,255,.06));" +
        "color:var(--dsw-alias-label-primary, #e8eaed);font-size:13px;line-height:18px;" +
        "font-family:inherit;",
    );
    const label = document.createElement("span");
    label.textContent = "有更新";
    const ver = document.createElement("span");
    ver.style.cssText = "margin-left:auto;font-size:12px;opacity:.85;white-space:nowrap;";
    el.appendChild(label);
    el.appendChild(ver);
    el._ver = ver;
    el.addEventListener("click", onClick);
    document.body.appendChild(el);
    return el;
  }

  function render() {
    if (!button) return;
    if (!state.hasUpdate) {
      button.style.display = "none";
      return;
    }
    if (state.updateState === "updating") button._ver.textContent = "更新中…";
    else if (state.updateState === "done") button._ver.textContent = "已更新·请重启程序";
    else if (state.updateState === "error") button._ver.textContent = "更新失败";
    else button._ver.textContent = "v" + (state.latest || "");
    position();
  }

  function position() {
    if (!button || !state.hasUpdate) return;
    const trig = findTrigger();
    if (!trig) {
      button.style.display = "none";
      return;
    }
    const r = trig.getBoundingClientRect();
    if (r.width < 120) {
      // 侧边栏折叠成窄条：放不下，隐藏
      button.style.display = "none";
      return;
    }
    button.style.display = "flex";
    button.style.visibility = "hidden";
    const h = button.offsetHeight;
    const GAP = 6;
    button.style.left = r.left + "px";
    button.style.top = r.top - GAP - h + "px";
    button.style.width = r.width + "px";
    button.style.visibility = "";
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/plugins/update-check/status", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      state.installed = j.installed ?? state.installed;
      state.latest = j.latest ?? state.latest;
      state.hasUpdate = !!j.hasUpdate;
      state.updateState = j.updateState ?? state.updateState;
      if (!button) button = build();
      render();
    } catch {}
  }

  function onClick() {
    if (state.updateState === "updating") return;
    const ok = confirm(
      "检测到新版本 v" + (state.latest || "") + "（当前 v" + (state.installed || "") + "）。\n\n" +
        "现在更新？更新完成后需要手动重启 DSH 程序才能生效。",
    );
    if (!ok) return;
    state.updateState = "updating";
    render();
    fetch("/plugins/update-check/update", { method: "POST" }).catch(() => {});
    pollUpdate();
  }

  function pollUpdate() {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/plugins/update-check/status", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        state.updateState = j.updateState ?? state.updateState;
        state.latest = j.latest ?? state.latest;
        state.hasUpdate = !!j.hasUpdate;
        if (j.updateState === "done" || j.updateState === "error") {
          clearInterval(timer);
          if (j.updateState === "error") {
            render();
            alert("更新失败，请查看服务端日志后重试。");
          } else {
            // 完成：保持按钮提示「请重启程序」，不自动重启（避免影响正在运行的程序）
            render();
          }
        } else {
          render();
        }
      } catch {}
    }, 1500);
  }

  function start() {
    fetchStatus();
    setInterval(fetchStatus, 30 * 60 * 1000); // 每 30 分钟再查一次
    setInterval(() => {
      if (button && state.hasUpdate) position();
    }, 500); // 侧边栏折叠/窗口缩放时校正位置
    window.addEventListener("resize", () => {
      if (button && state.hasUpdate) position();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
