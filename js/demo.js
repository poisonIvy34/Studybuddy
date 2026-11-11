/* js/demo.js — the demo panel. NOT part of the product.
 *
 * D49: a simple panel for the class presentation, built around one persona, Emma.
 * SB.demo.render() draws a collapsible drawer into #demo with:
 *  - Clock: fake "now" in MT, plus four story jumps for Emma's next study time:
 *    Group forms (lock, T−24h) / 30 min before / 15 min before / Session ends. Past jumps are disabled.
 *    Every clock change goes through SB.store.advance(newNow).
 *  - User: Emma or signed out → SB.store.switchUser(id | null).
 *  - Start over → SB.store.reset().
 * The location stays "in_range" (the seed's value); there is no location switch.
 * Panel-only UI state (open/closed, last message) lives in memory, not in app state.
 */
(function () {
  var SB = (window.SB = window.SB || {});
  var PERSONA = "stu_emma";

  // Starts collapsed as a small tab at the top, so it never covers the app (tester feedback).
  var ui = { open: false, msg: null };
  function isPhone() { return window.matchMedia && window.matchMedia("(max-width: 480px)").matches; }

  function ms(iso) { return SB.clock.toMs(iso); }

  function run(result, okMsg) {
    if (result && result.ok === false) ui.msg = { kind: "error", text: result.error || "That didn't work." };
    else ui.msg = okMsg ? { kind: "ok", text: okMsg } : null;
    render();
  }

  function advanceTo(iso, label) {
    if (ms(iso) <= ms(SB.clock.now())) {
      ui.msg = { kind: "error", text: "The clock only moves forward." };
      render();
      return;
    }
    var r = SB.store.advance(iso);
    // On a phone, fold the panel away after a jump so the result is visible.
    if (r && r.ok !== false && isPhone()) ui.open = false;
    run(r, label + ": " + SB.clock.fmt(iso, "dayTime"));
  }

  // The current student's next study time that hasn't ended: a seat's slot or an active pick.
  function storySlot(state, nowMs) {
    var me = state.demo.currentUserId, ids = {};
    if (!me) return null;
    (state.seats || []).forEach(function (x) {
      if (x.studentId !== me || x.status === "cancelled" || x.status === "released") return;
      var ses = (state.sessions || []).find(function (s) { return s.id === x.sessionId; });
      if (ses) ids[ses.slotId] = true;
    });
    (state.picks || []).forEach(function (p) { if (p.studentId === me && p.status === "active") ids[p.slotId] = true; });
    return (state.slots || [])
      .filter(function (s) { return ids[s.id] && s.status !== "dropped" && ms(s.end) > nowMs; })
      .sort(function (a, b) { return ms(a.start) - ms(b.start) || (a.id < b.id ? -1 : 1); })[0] || null;
  }

  function storyJumps(state, slot) {
    var s = state.settings, start = ms(slot.start), H = 3600000, M = 60000;
    return [
      { label: "1. Group forms", hint: s.lockHoursBefore + "h before", at: start - s.lockHoursBefore * H },
      { label: "2. 30 min before", hint: "Still coming?", at: start - s.confirmMinutesBefore * M },
      { label: "3. 15 min before", hint: "I'm here opens", at: start - s.checkInOpensMinutesBefore * M },
      { label: "4. Session ends", hint: "How prepared?", at: ms(slot.end) }
    ].map(function (t) { t.iso = SB.clock.fromMs(t.at); return t; });
  }

  function section(title, body) {
    var h = SB.ui.h;
    return h("section", { class: "demo-section" }, h("div", { class: "demo-label" }, title), body);
  }

  function goHome() {
    // "/" is not a route, so the guards send the user to their home (or #/signin).
    SB.router.go("#/");
  }

  function render() {
    var mount = document.getElementById("demo");
    if (!mount) return;
    var h = SB.ui.h, button = SB.ui.button;
    var state = SB.store && SB.store.get ? SB.store.get() : null;
    mount.innerHTML = "";
    if (!state) return;

    var head = h(
      "div",
      { class: "demo-head" },
      h("span", { class: "demo-title" }, ui.open ? "Demo controls (not part of the app)" : "Demo"),
      h(
        "button",
        {
          type: "button",
          class: "demo-toggle",
          "aria-expanded": ui.open ? "true" : "false",
          onclick: function () { ui.open = !ui.open; render(); }
        },
        ui.open ? "Hide ▴" : "Open ▾"
      )
    );

    var panel = h("aside", { class: ["demo", !ui.open && "collapsed"], "aria-label": "Demo panel" }, head);
    mount.appendChild(panel);
    if (!ui.open) return;

    var now = SB.clock.now();
    var nowMs = ms(now);

    // Clock: Emma's four story jumps
    var slot = storySlot(state, nowMs);
    var jumps;
    if (!state.demo.currentUserId) {
      jumps = [h("div", { class: "demo-hint" }, "Choose Emma below to start.")];
    } else if (!slot) {
      jumps = [h("div", { class: "demo-hint" }, "Pick a study time on the Study page first. The skip-ahead buttons appear here after you pick.")];
    } else {
      jumps = storyJumps(state, slot).map(function (t) {
        var past = t.at <= nowMs;
        var b = button(t.label, function () { advanceTo(t.iso, t.label.replace(/^\d\. /, "")); },
          { kind: "secondary", disabled: past, class: "btn-small demo-jump" });
        b.title = t.hint + " · " + SB.clock.fmt(t.iso, "dayTime") + (past ? " (already past)" : "");
        return b;
      });
    }

    var clock = section(
      "Clock",
      h(
        "div",
        null,
        h("div", { class: "demo-now" }, SB.clock.fmt(now, "full")),
        slot ? h("div", { class: "demo-sub" }, "Skip ahead to Emma's study time (" + SB.clock.fmt(slot.start, "dayTime") + "):") : null,
        h("div", { class: "demo-btns" }, jumps)
      )
    );

    // User: Emma or signed out
    var cur = state.demo.currentUserId || "";
    var emma = (state.students || []).find(function (s) { return s.id === PERSONA; });
    var userSel = h(
      "select",
      {
        class: "demo-user",
        "aria-label": "Current user",
        onchange: function (e) {
          var r = SB.store.switchUser(e.target.value || null);
          if (r && r.ok === false) run(r);
          else { ui.msg = null; goHome(); }
        }
      },
      emma ? h("option", { value: emma.id, selected: emma.id === cur }, "Emma (Sophomore, STAT 121)") : null,
      h("option", { value: "", selected: cur !== PERSONA }, "Signed out")
    );
    var user = section("User", userSel);

    // Start over
    var reset = section(
      "Data",
      button("Start over", function () {
        var r = SB.store.reset();
        if (r && r.ok === false) run(r);
        else { ui.msg = { kind: "ok", text: "Back to the start of Emma's story." }; goHome(); render(); }
      }, { kind: "danger", class: "btn-small demo-reset" })
    );

    var body = h(
      "div",
      { class: "demo-body" },
      clock,
      user,
      reset,
      ui.msg ? h("div", { class: ["demo-msg", ui.msg.kind === "error" ? "error" : "success"] }, ui.msg.text) : null
    );
    panel.appendChild(body);
  }

  SB.demo = { render: render };
})();
