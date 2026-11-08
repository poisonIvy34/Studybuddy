/* js/demo.js — the demo panel. NOT part of the product.
 *
 * SB.demo.render() draws a collapsible drawer into #demo with:
 *  - Clock: fake "now" in MT; +15m / +1h / +1 day; a slot chooser with "Jump to"
 *    Lock (T−48h) / T−24h / T−3h / T−30m / T−15m / T / End / End+24h. Past targets are disabled.
 *    Every clock change goes through SB.store.advance(newNow).
 *  - Location: In range / Out of range / Denied → SB.store.setLocation(v).
 *  - User: signed out, any admin, any student → SB.store.switchUser(id | null).
 *  - Reset → SB.store.reset().
 * Panel-only UI state (open/closed, chosen slot, last message) lives in memory, not in app state.
 */
(function () {
  var SB = (window.SB = window.SB || {});

  // Starts collapsed as a small tab at the top, so it never covers the app (tester feedback).
  var ui = { open: false, slotId: null, msg: null };
  function isPhone() { return window.matchMedia && window.matchMedia("(max-width: 480px)").matches; }

  function ms(iso) { return SB.clock.toMs(iso); }

  function run(result, okMsg) {
    if (result && result.ok === false) ui.msg = { kind: "error", text: result.error || "That didn't work." };
    else ui.msg = okMsg ? { kind: "ok", text: okMsg } : null;
    render();
  }

  function advanceTo(iso) {
    var now = SB.clock.now();
    if (ms(iso) <= ms(now)) {
      ui.msg = { kind: "error", text: "The clock only moves forward." };
      render();
      return;
    }
    var r = SB.store.advance(iso);
    // On a phone, fold the panel away after a jump so the result is visible.
    if (r && r.ok !== false && isPhone()) ui.open = false;
    run(r, "Now " + SB.clock.fmt(iso, "dayTime"));
  }

  function jumpTargets(state, slot) {
    var s = state.settings || {};
    var start = ms(slot.start);
    var end = ms(slot.end);
    var H = 3600 * 1000, M = 60 * 1000;
    var lockH = s.lockHoursBefore != null ? s.lockHoursBefore : 48;
    var lowH = s.lowTurnoutHoursBefore != null ? s.lowTurnoutHoursBefore : 3;
    var confM = s.confirmMinutesBefore != null ? s.confirmMinutesBefore : 30;
    var inM = s.checkInOpensMinutesBefore != null ? s.checkInOpensMinutesBefore : 15;
    var postH = s.postWindowHours != null ? s.postWindowHours : 24;
    return [
      { label: "Lock (T−" + lockH + "h)", at: start - lockH * H },
      { label: "T−" + s.earlyConfirmAskHoursBefore + "h", at: start - s.earlyConfirmAskHoursBefore * H },
      { label: "T−" + lowH + "h", at: start - lowH * H },
      { label: "T−" + confM + "m", at: start - confM * M },
      { label: "T−" + inM + "m", at: start - inM * M },
      { label: "T", at: start },
      { label: "End", at: end },
      { label: "End+" + postH + "h", at: end + postH * H }
    ].map(function (t) { t.iso = SB.clock.fromMs(t.at); return t; });
  }

  // Every Jump to target of a slot is in the past once End+24h has passed.
  function slotOver(state, slot, nowMs) {
    return ms(slot.end) + (state.settings.postWindowHours || 24) * 3600000 <= nowMs;
  }

  function slotLabel(state, slot, nowMs) {
    var course = (state.courses || []).find(function (c) { return c.id === slot.courseId; });
    return [
      course ? course.name.split(":")[0] : "?",
      SB.clock.fmt(slot.start, "dayTime"),
      slotOver(state, slot, nowMs) ? "already over" : slot.status
    ].join(" · ");
  }

  // Slots the current student has a seat or an active pick in.
  function mySlotIds(state) {
    var me = state.demo.currentUserId, ids = {};
    if (!me) return ids;
    (state.seats || []).forEach(function (x) {
      if (x.studentId !== me) return;
      var ses = (state.sessions || []).find(function (s) { return s.id === x.sessionId; });
      if (ses) ids[ses.slotId] = true;
    });
    (state.picks || []).forEach(function (p) { if (p.studentId === me && p.status === "active") ids[p.slotId] = true; });
    return ids;
  }

  function sortedSlots(state) {
    return (state.slots || []).slice().sort(function (a, b) {
      return ms(a.start) - ms(b.start) || (a.id < b.id ? -1 : 1);
    });
  }

  function chosenSlot(state, slots, nowMs) {
    var s = ui.slotId && slots.find(function (x) { return x.id === ui.slotId; });
    if (s) return s;
    // Default: the current student's next session that isn't over, else the next slot of anyone.
    var mine = mySlotIds(state);
    s = slots.find(function (x) { return mine[x.id] && !slotOver(state, x, nowMs); }) ||
        slots.find(function (x) { return ms(x.start) > nowMs; }) || slots[0] || null;
    ui.slotId = s ? s.id : null;
    return s;
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

    // Clock
    var slots = sortedSlots(state);
    var slot = chosenSlot(state, slots, nowMs);
    var select = h(
      "select",
      {
        class: "demo-slot",
        "aria-label": "Slot",
        onchange: function (e) { ui.slotId = e.target.value; ui.msg = null; render(); }
      },
      (function () {
        var mine = mySlotIds(state);
        function opt(s) { return h("option", { value: s.id, selected: slot && s.id === slot.id }, slotLabel(state, s, nowMs)); }
        var mineList = slots.filter(function (s) { return mine[s.id]; });
        var groups = [];
        if (mineList.length) groups.push(h("optgroup", { label: "This student's sessions and picks" }, mineList.map(opt)));
        groups.push(h("optgroup", { label: "All study times" }, slots.map(opt)));
        return groups;
      })()
    );
    var anyPast = false;
    var jumps = slot
      ? jumpTargets(state, slot).map(function (t) {
          var past = t.at <= nowMs;
          if (past) anyPast = true;
          var b = button(t.label, function () { advanceTo(t.iso); }, { kind: "secondary", disabled: past, class: "btn-small demo-jump" });
          b.title = SB.clock.fmt(t.iso, "dayTime") + (past ? " (already past)" : "");
          return b;
        })
      : [h("span", { class: "muted small" }, "No slots.")];
    // Explain grey buttons: the clock only moves forward.
    if (anyPast) {
      jumps.push(h("div", { class: "demo-hint" },
        slot && slotOver(state, slot, nowMs)
          ? "This session is already over, so its times are greyed out. Pick a later one above, or tap Reset to start over."
          : "Grey times have already passed (the clock only moves forward). Tap Reset to start over."));
    }

    var clock = section(
      "Clock",
      h(
        "div",
        null,
        h("div", { class: "demo-now" }, SB.clock.fmt(now, "full")),
        h(
          "div",
          { class: "demo-btns" },
          button("+15m", function () { advanceTo(SB.clock.add(now, { minutes: 15 })); }, { kind: "secondary", class: "btn-small demo-step" }),
          button("+1h", function () { advanceTo(SB.clock.add(now, { hours: 1 })); }, { kind: "secondary", class: "btn-small demo-step" }),
          button("+1 day", function () { advanceTo(SB.clock.add(now, { days: 1 })); }, { kind: "secondary", class: "btn-small demo-step" })
        ),
        h("div", { class: "demo-sub" }, "Jump to, for slot:"),
        select,
        h("div", { class: "demo-btns" }, jumps)
      )
    );

    // Location
    var locs = [
      { v: "in_range", label: "In range" },
      { v: "out_of_range", label: "Out of range" },
      { v: "denied", label: "Denied" }
    ];
    var locSec = section(
      "Location (next I'm here tap)",
      h(
        "div",
        { class: "demo-btns demo-seg" },
        locs.map(function (l) {
          var on = state.demo.location === l.v;
          var b = button(l.label, function () { run(SB.store.setLocation(l.v)); }, {
            kind: on ? "primary" : "secondary",
            class: "btn-small demo-loc"
          });
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.dataset.value = l.v;
          return b;
        })
      )
    );

    // User
    var cur = state.demo.currentUserId || "";
    var userSel = h(
      "select",
      {
        class: "demo-user",
        "aria-label": "Current user",
        onchange: function (e) {
          var r = SB.store.switchUser(e.target.value || null);
          if (r && r.ok === false) run(r);
          else { ui.msg = null; ui.slotId = null; goHome(); }
        }
      },
      h("option", { value: "", selected: !cur }, "Signed out"),
      h(
        "optgroup",
        { label: "Admins" },
        (state.admins || []).map(function (a) {
          return h("option", { value: a.id, selected: a.id === cur }, a.name + " — " + a.email);
        })
      ),
      h(
        "optgroup",
        { label: "Students" },
        (state.students || []).map(function (s) {
          return h("option", { value: s.id, selected: s.id === cur }, (s.firstName || "(new)") + " — " + s.email);
        })
      )
    );
    var user = section("User", userSel);

    // Reset
    var reset = section(
      "Data",
      button("Reset to seed", function () {
        var r = SB.store.reset();
        if (r && r.ok === false) run(r);
        else { ui.slotId = null; ui.msg = { kind: "ok", text: "Seed data restored." }; goHome(); render(); }
      }, { kind: "danger", class: "btn-small demo-reset" })
    );

    var body = h(
      "div",
      { class: "demo-body" },
      clock,
      locSec,
      user,
      reset,
      ui.msg ? h("div", { class: ["demo-msg", ui.msg.kind === "error" ? "error" : "success"] }, ui.msg.text) : null
    );
    panel.appendChild(body);
  }

  SB.demo = { render: render };
})();
