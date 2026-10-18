(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var TAB_IDS = ["product", "design", "tech", "plan"];

  /* ---------- Tabs and deep links ---------- */
  var panels = $$(".panel");
  var tabs = $$(".tab");

  function activate(tabId) {
    panels.forEach(function (p) {
      var on = p.id === "panel-" + tabId;
      p.classList.toggle("is-active", on);
      p.setAttribute("aria-hidden", on ? "false" : "true");
      if (on) { p.removeAttribute("inert"); } else { p.setAttribute("inert", ""); }
    });
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-tab") === tabId;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
  }

  function resolve(hash, smooth) {
    var id = "";
    try { id = decodeURIComponent(String(hash || "").replace(/^#/, "")); } catch (e) { id = ""; }
    if (!id) { return false; }
    if (TAB_IDS.indexOf(id) !== -1) {
      activate(id);
      window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
      return true;
    }
    var el = document.getElementById(id);
    if (!el) { return false; }
    var panel = el.closest(".panel");
    if (panel) { activate(panel.id.replace("panel-", "")); }
    if (el.hidden) { el.hidden = false; }
    requestAnimationFrame(function () {
      el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    });
    if (el.classList.contains("req") || el.classList.contains("task") || el.classList.contains("check")) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
    return true;
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) { return; }
    var hash = a.getAttribute("href");
    if (!hash || hash.length < 2) { return; }
    if (resolve(hash, true)) {
      e.preventDefault();
      try { history.replaceState(null, "", hash); } catch (err) { /* not allowed here */ }
    }
  });

  tabs.forEach(function (t, i) {
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") { return; }
      e.preventDefault();
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  });

  if (!resolve(location.hash, false)) { activate("product"); }
  window.addEventListener("hashchange", function () { resolve(location.hash, true); });

  /* ---------- Requirement filter ---------- */
  var filter = $("#req-filter");
  if (filter) {
    var reqs = $$(".req");
    var groups = $$(".req-group");
    var count = $("#req-count");
    var empty = $("#req-empty");
    var total = reqs.length;
    var runFilter = function () {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      reqs.forEach(function (r) {
        var hit = !q || (r.getAttribute("data-search") || "").indexOf(q) !== -1;
        r.hidden = !hit;
        if (hit) { shown += 1; }
      });
      groups.forEach(function (g) {
        g.hidden = !$$(".req", g).some(function (r) { return !r.hidden; });
      });
      count.textContent = q ? "Showing " + shown + " of " + total : total + " requirements";
      empty.hidden = shown > 0;
    };
    filter.addEventListener("input", runFilter);
    runFilter();
  }

  /* ---------- Risk filter ---------- */
  $$(".filters").forEach(function (bar) {
    var target = document.getElementById(bar.getAttribute("data-target"));
    if (!target) { return; }
    var buttons = $$("button", bar);
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var want = b.getAttribute("data-value");
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        $$("[data-filter-value]", target).forEach(function (card) {
          card.hidden = !(want === "all" || card.getAttribute("data-filter-value") === want);
        });
      });
    });
  });

  /* ---------- Segmented diagram switchers ---------- */
  $$(".switcher").forEach(function (sw) {
    var buttons = $$(".switch-seg button", sw);
    var panes = $$(".pane", sw);
    buttons.forEach(function (b, i) {
      b.addEventListener("click", function () {
        buttons.forEach(function (x, j) { x.setAttribute("aria-pressed", i === j ? "true" : "false"); });
        panes.forEach(function (p, j) {
          var on = i === j;
          p.classList.toggle("is-on", on);
          p.setAttribute("aria-hidden", on ? "false" : "true");
          if (on) { p.removeAttribute("inert"); } else { p.setAttribute("inert", ""); }
        });
      });
    });
  });

  /* ---------- Copy hex values ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".copy") : null;
    if (!b) { return; }
    var value = b.getAttribute("data-copy");
    var label = $(".label", b);
    var done = function () {
      if (!label) { return; }
      var before = label.textContent;
      label.textContent = "Copied";
      label.classList.add("done");
      setTimeout(function () { label.textContent = before; label.classList.remove("done"); }, 1400);
    };
    var select = function () {
      var hex = $(".hex", b) || b;
      try {
        var r = document.createRange();
        r.selectNodeContents(hex);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (err) { /* selection not available */ }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done, select);
      } else {
        select();
      }
    } catch (err) { select(); }
  });

  /* ---------- Plan: ticks from the db capability ---------- */
  var plan = $("#panel-plan");
  if (!plan) { return; }
  var taskEls = $$(".task", plan);
  var phaseEls = $$(".phase", plan);
  var statusLine = $("#tick-status");
  var ticks = new Map();

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) { return ""; }
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return ""; }
  }
  function isDone(el) {
    if (el.getAttribute("data-md-done") === "1") { return true; }
    var t = ticks.get(el.getAttribute("data-id"));
    return !!(t && t.done === true);
  }
  function setStatus(text, live) {
    if (!statusLine) { return; }
    $(".txt", statusLine).textContent = text;
    statusLine.setAttribute("data-live", live ? "1" : "0");
  }

  function recompute() {
    var total = 0;
    var done = 0;
    var current = null;
    phaseEls.forEach(function (ph) {
      var ts = $$(".task", ph);
      var d = ts.filter(isDone).length;
      total += ts.length;
      done += d;
      var status = d === 0 ? "Not started" : (d === ts.length ? "Done" : "In progress");
      var key = ph.getAttribute("data-phase");
      $$('[data-phase-status="' + key + '"]').forEach(function (chip) {
        chip.textContent = status;
        chip.setAttribute("data-state", status);
      });
      $$('[data-phase-count="' + key + '"]').forEach(function (c) { c.textContent = d + " of " + ts.length + " tasks"; });
      $$('[data-phase-bar="' + key + '"]').forEach(function (b) { b.style.width = (ts.length ? Math.round(d / ts.length * 100) : 0) + "%"; });
      if (!current && status !== "Done") { current = ph; }
    });
    var next = null;
    taskEls.forEach(function (el) {
      var d = isDone(el);
      el.classList.toggle("is-done", d);
      var cb = $("input", el);
      if (cb) { cb.checked = d; }
      var t = ticks.get(el.getAttribute("data-id"));
      var note = $(".tnote", el);
      if (note) {
        if (t && typeof t.note === "string" && t.note) { note.textContent = t.note; note.hidden = false; }
        else { note.textContent = ""; note.hidden = true; }
      }
      var when = $(".twhen", el);
      if (when) {
        var stamp = d && t && t.done_at ? fmtDate(t.done_at) : "";
        when.textContent = stamp ? "Done " + stamp : "";
        when.hidden = !stamp;
      }
      if (!next && !d) { next = el; }
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    var ring = $("#hero-ring");
    if (ring) {
      var r = 54;
      var c = 2 * Math.PI * r;
      ring.setAttribute("stroke-dasharray", c.toFixed(2));
      ring.setAttribute("stroke-dashoffset", (c * (1 - pct / 100)).toFixed(2));
    }
    var pctEl = $("#hero-pct");
    if (pctEl) { pctEl.firstChild.nodeValue = pct + "%"; }
    var countEl = $("#hero-count");
    if (countEl) { countEl.textContent = done + " of " + total + " tasks done"; }
    var barEl = $("#hero-bar");
    if (barEl) { barEl.style.width = pct + "%"; }
    var phaseEl = $("#hero-phase");
    if (phaseEl) {
      if (current) {
        phaseEl.textContent = current.getAttribute("data-title");
        phaseEl.setAttribute("href", "#" + current.id);
      } else {
        phaseEl.textContent = "Every phase is done";
        phaseEl.removeAttribute("href");
      }
    }
    var nextEl = $("#hero-next");
    if (nextEl) {
      if (next) {
        nextEl.textContent = $(".ttext", next).textContent;
        nextEl.setAttribute("href", "#" + next.id);
      } else {
        nextEl.textContent = "Nothing left to tick";
        nextEl.removeAttribute("href");
      }
    }
  }

  recompute();

  function lockAll() {
    taskEls.forEach(function (el) { var cb = $("input", el); if (cb) { cb.disabled = true; } });
  }

  function wire() {
    var c = window.claude;
    if (!c || typeof c.use !== "function") {
      setStatus("Showing the plan as written. Live ticks appear when this page is opened on claude.ai.", false);
      return;
    }
    Promise.all([c.use("db"), c.use("user")]).then(function (res) {
      var db = res[0];
      var user = res[1];
      if (!db) {
        setStatus("Showing the plan as written. Live ticks are not available in this view.", false);
        return;
      }
      var readOnly = true;
      var myId = null;
      var userChecks = user ? Promise.all([user.canEdit(), user.id()]) : Promise.resolve([false, null]);
      userChecks.then(function (u) {
        readOnly = !u[0];
        myId = u[1] || null;
        if (!readOnly) { enable(); }
        setStatus(readOnly ? "Ticks are live. Only the owner and editors can check tasks off." : "Ticks are live. Check a task off once its checks pass.", true);
      }, function () { /* reads never reject; keep read-only */ });

      db.collection("tasks").limit(500).onSnapshot(function (snap) {
        var m = new Map();
        snap.docs.forEach(function (d) {
          if (!d.exists) { return; }
          var body = d.data();
          if (body && typeof body === "object") { m.set(d.id, body); }
        });
        ticks = m;
        recompute();
      }, function () {
        setStatus("Live ticks stopped. Reload the page to see the latest.", false);
      });

      function enable() {
        taskEls.forEach(function (el) {
          if (el.getAttribute("data-md-done") === "1") { return; }
          var cb = $("input", el);
          if (!cb) { return; }
          cb.disabled = false;
          cb.addEventListener("change", function () {
            if (readOnly) { return; }
            var id = el.getAttribute("data-id");
            var want = cb.checked;
            var stamp = want ? new Date().toISOString() : null;
            cb.disabled = true;
            var ref = db.collection("tasks").doc(id);
            var write = ticks.has(id)
              ? ref.update({ done: want, done_at: stamp, by: myId || "editor" })
              : ref.set({ done: want, done_at: stamp, text: el.getAttribute("data-text"), by: myId || "editor" });
            write.then(function () {
              if (!readOnly) { cb.disabled = false; }
            }, function (err) {
              cb.checked = !want;
              if (err && err.code === "invalid_argument") {
                readOnly = true;
                lockAll();
                setStatus("Ticks are live, but this view can't change them.", true);
              } else {
                cb.disabled = false;
              }
            });
          });
        });
      }
    }, function () {
      setStatus("Showing the plan as written. Live ticks are not available in this view.", false);
    });
  }
  wire();
})();
