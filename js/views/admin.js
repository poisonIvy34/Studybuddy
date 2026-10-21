/* js/views/admin.js — all admin screens.
 *
 * Routes (registered here):
 *   #/admin/courses   courses, exams, slots (create / edit before lock), pilot end date, Admin inbox
 *   #/admin/slot/:id  one slot: picks, lock result, tables, seats, confirmations, check-ins
 *   #/admin/review    unverified check-ins and reports, Accept / Reject
 *   #/admin/strikes   strikes per student, Remove
 *   #/admin/metrics   pilot metrics (overall + per course, D25), no-show rate, NPS
 *
 * Reads state with SB.store.get() (deep-frozen: copy arrays before sorting) and changes it only
 * through SB.store actions. No business rules live here: locks, strikes and metrics come from SB.rules.
 * Out of scope here: deleting locked slots and cancelling sessions (Still open #10), CSV export (D10).
 */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});

  // Which inline form is open on #/admin/courses: "course:<id>", "course:new", "exam:<id>",
  // "exam:new:<courseId>", "slot:<id>", "slot:new:<examId>", or null. View-only UI state.
  var editKey = null;

  // ---------- small helpers ----------
  function h() { return SB.ui.h.apply(null, arguments); }
  function st() { return SB.store.get(); }
  function byId(arr, id) {
    for (var i = 0; i < (arr || []).length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function sorted(arr, keyFn) {
    return (arr || []).slice().sort(function (a, b) {
      var x = keyFn(a), y = keyFn(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  function ms(iso) { return SB.clock.toMs(iso); }
  function fmt(iso, kind) { return iso ? SB.clock.fmt(iso, kind || "dayTime") : "—"; }
  function slotWhen(slot) { return SB.clock.fmt(slot.start, "dayTime") + "–" + SB.clock.fmt(slot.end, "time"); }

  // ISO (any offset) -> "YYYY-MM-DDTHH:mm" in MT, for <input type="datetime-local">.
  function toInput(iso) {
    if (!iso || isNaN(ms(iso))) return "";
    return SB.clock.fromMs(ms(iso)).slice(0, 16);
  }
  // "YYYY-MM-DDTHH:mm" read as MT wall-clock time -> ISO with the right MT offset (via SB.clock).
  function fromInput(v) {
    if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
    var offsets = ["-07:00", "-06:00"];
    for (var i = 0; i < offsets.length; i++) {
      var m = ms(v + ":00" + offsets[i]);
      if (!isNaN(m) && SB.clock.fromMs(m).slice(0, 16) === v) return SB.clock.fromMs(m);
    }
    return null;
  }

  function personName(s) {
    if (!s) return "Deleted student";
    return s.firstName || "(no name yet)";
  }
  function slotOfSession(state, ses) { return ses ? byId(state.slots, ses.slotId) : null; }
  function examOfSlot(state, slot) { return slot ? byId(state.exams, slot.examId) : null; }
  function courseOfExam(state, exam) { return exam ? byId(state.courses, exam.courseId) : null; }
  function slotLabel(state, slot) {
    if (!slot) return "Unknown slot";
    var exam = examOfSlot(state, slot), course = courseOfExam(state, exam);
    return (course ? course.name + " · " : "") + (exam ? exam.name + " · " : "") + slotWhen(slot);
  }

  function statusTag(status) {
    var cls = { open: "tag-info", locked: "tag-ok", dropped: "tag-muted" }[status] || "tag-muted";
    return h("span", { class: ["tag", cls] }, status);
  }
  function seatTag(status) {
    var cls = {
      placed: "tag-info", confirmed: "tag-info", attended: "tag-ok",
      cancelled: "tag-muted", released: "tag-muted", no_show: "tag-bad"
    }[status] || "tag-muted";
    return h("span", { class: ["tag", cls] }, status.replace("_", "-"));
  }
  function vibeTag(v) { return h("span", { class: ["tag", v === "chatty" ? "tag-chatty" : "tag-quiet"] }, v); }
  function checkinTag(c) {
    if (c.result === "in_range") return h("span", { class: "tag tag-ok" }, "in range");
    if (c.result === "out_of_range") return h("span", { class: "tag tag-warn" }, "out of range");
    var txt = c.adminDecision ? "unverified · " + c.adminDecision : "unverified · needs review";
    var cls = c.adminDecision === "rejected" ? "tag-bad" : c.adminDecision === "accepted" ? "tag-ok" : "tag-warn";
    return h("span", { class: ["tag", cls] }, txt);
  }

  function msgBox() { return h("div", { class: "v-admin-msg", role: "status" }); }
  function showMsg(el, text, kind) {
    el.innerHTML = "";
    if (text) el.appendChild(h("div", { class: ["notice", "notice-" + (kind || "error")] }, text));
  }

  // Runs a store action; on failure shows the error text in msgEl. Closes the open form first on success.
  function act(msgEl, fn, closeForm) {
    var prev = editKey;
    if (closeForm) editKey = null;
    var r = fn();
    if (!r || !r.ok) {
      editKey = prev;
      if (msgEl) showMsg(msgEl, (r && r.error) || "Something went wrong.");
      else if (r && r.error) window.alert(r.error);
    }
    return r;
  }

  function openForm(key) { editKey = key; SB.router.render(); }
  function closeForm() { editKey = null; SB.router.render(); }

  function root(mountEl, title, sub) {
    var el = h("div", { class: "v-admin" }, h("h1", null, title), sub ? h("p", { class: "muted small" }, sub) : null);
    mountEl.appendChild(el);
    return el;
  }

  function tableWrap(head, rows, emptyText) {
    if (!rows.length) return SB.ui.empty(emptyText || "Nothing here yet.");
    return h("div", { class: "table-wrap" },
      h("table", { class: "table" },
        h("thead", null, h("tr", null, head.map(function (c) {
          return h("th", { class: c.num ? "num" : null }, c.label || c);
        }))),
        h("tbody", null, rows)));
  }

  // ---------- #/admin/courses ----------
  function inboxSection(state) {
    var items = sorted(
      (state.notifications || []).filter(function (n) { return n.to === "admin"; }),
      function (n) { return -ms(n.at); }
    );
    var wrap = h("section", { class: "v-admin-section" }, h("h2", null, "Admin inbox"));
    if (!items.length) {
      wrap.appendChild(SB.ui.empty("No alerts. Low-turnout and out-of-spots alerts show up here."));
      return wrap;
    }
    var list = h("div", { class: "inbox" });
    items.forEach(function (n) {
      var kindLabel = n.kind === "low_turnout" ? "Low turnout" : n.kind === "out_of_spots" ? "Out of spots" : n.kind;
      list.appendChild(h("div", { class: ["inbox-item", n.read && "v-admin-read"] },
        h("div", { class: "row-between row-wrap" },
          h("span", { class: "strong" }, kindLabel, n.read ? null : h("span", { class: "tag tag-warn v-admin-gap" }, "new")),
          h("span", { class: "small muted" }, fmt(n.at))),
        h("div", { class: "v-admin-inbox-text" }, n.text),
        h("div", { class: "btn-group mt" },
          n.route ? SB.ui.button("Open slot", function () {
            if (!n.read) SB.store.markRead(n.id);
            SB.router.go(n.route);
          }, { kind: "secondary", class: "btn-small" }) : null,
          n.read ? null : SB.ui.button("Mark read", function () { act(null, function () { return SB.store.markRead(n.id); }); },
            { kind: "secondary", class: "btn-small" }))));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function pilotSection(state) {
    var input = h("input", { type: "datetime-local", value: toInput(state.settings.pilotEnd) });
    var msg = msgBox();
    var open = SB.rules.surveyOpen(state, SB.clock.now());
    return h("section", { class: "v-admin-section" },
      h("h2", null, "Pilot end date"),
      SB.ui.card(
        h("p", { class: "small muted" }, "The exit survey and NPS open at this time (D14). Times are Mountain Time."),
        h("p", null, "Now set to ", h("span", { class: "strong" }, fmt(state.settings.pilotEnd, "full")), " ",
          h("span", { class: ["tag", open ? "tag-ok" : "tag-muted"] }, open ? "survey open" : "not open yet")),
        h("div", { class: "row row-wrap" },
          h("div", { class: "grow v-admin-input" }, SB.ui.field("Pilot end (MT)", input)),
          SB.ui.button("Save", function () {
            var iso = fromInput(input.value);
            if (!iso) return showMsg(msg, "Enter a date and time.");
            act(msg, function () { return SB.store.setPilotEnd(iso); });
          })),
        msg));
  }

  function courseForm(state, course) {
    var c = course || { name: "", section: "", linkCode: "", enrolled: 0 };
    var f = {
      name: h("input", { type: "text", value: c.name }),
      section: h("input", { type: "text", value: c.section }),
      linkCode: h("input", { type: "text", value: c.linkCode }),
      enrolled: h("input", { type: "number", min: "0", step: "1", value: String(c.enrolled) })
    };
    var msg = msgBox();
    return h("div", { class: "card v-admin-form" },
      h("div", { class: "card-title" }, course ? "Edit course" : "New course"),
      h("div", { class: "form-grid" },
        SB.ui.field("Course name", f.name), SB.ui.field("Section", f.section),
        SB.ui.field("Link code", f.linkCode), SB.ui.field("Enrolled students", f.enrolled)),
      msg,
      h("div", { class: "btn-group" },
        SB.ui.button(course ? "Save course" : "Add course", function () {
          var data = { name: f.name.value, section: f.section.value, linkCode: f.linkCode.value,
            enrolled: f.enrolled.value === "" ? NaN : Number(f.enrolled.value) };
          if (course) data.id = course.id;
          act(msg, function () { return SB.store.saveCourse(data); }, true);
        }),
        SB.ui.button("Cancel", closeForm, { kind: "secondary" })));
  }

  function examForm(state, exam, courseId) {
    var e = exam || { name: "", at: null };
    var f = { name: h("input", { type: "text", value: e.name }), at: h("input", { type: "datetime-local", value: toInput(e.at) }) };
    var msg = msgBox();
    return h("div", { class: "card v-admin-form" },
      h("div", { class: "card-title" }, exam ? "Edit exam" : "New exam"),
      h("div", { class: "form-grid" }, SB.ui.field("Exam name", f.name), SB.ui.field("Exam date and time (MT)", f.at)),
      msg,
      h("div", { class: "btn-group" },
        SB.ui.button(exam ? "Save exam" : "Add exam", function () {
          var data = { name: f.name.value, at: fromInput(f.at.value) };
          if (exam) data.id = exam.id; else data.courseId = courseId;
          act(msg, function () { return SB.store.saveExam(data); }, true);
        }),
        SB.ui.button("Cancel", closeForm, { kind: "secondary" })));
  }

  function slotForm(state, slot, examId) {
    var s = slot || { start: null, end: null, place: "", spots: [], vibe: "quiet" };
    var f = {
      start: h("input", { type: "datetime-local", value: toInput(s.start) }),
      end: h("input", { type: "datetime-local", value: toInput(s.end) }),
      place: h("input", { type: "text", value: s.place, placeholder: "e.g. HBLL 3rd floor" }),
      spots: h("input", { type: "text", value: (s.spots || []).join(", "), placeholder: "e.g. table 12, table 13" }),
      vibe: h("select", null,
        h("option", { value: "quiet", selected: s.vibe === "quiet" }, "Quiet"),
        h("option", { value: "chatty", selected: s.vibe === "chatty" }, "Chatty"))
    };
    var warnBox = h("div");
    var msg = msgBox();
    function draft() {
      return {
        id: slot ? slot.id : undefined, examId: slot ? slot.examId : examId,
        start: fromInput(f.start.value), end: fromInput(f.end.value),
        place: f.place.value, vibe: f.vibe.value,
        spots: f.spots.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean)
      };
    }
    function refreshWarnings() {
      warnBox.innerHTML = "";
      var d = draft();
      if (!d.start || !d.end) return;
      SB.rules.slotWarnings(st(), d).forEach(function (w) {
        warnBox.appendChild(h("div", { class: "notice notice-warn" }, w, " You can still save it (D29)."));
      });
    }
    f.start.addEventListener("change", refreshWarnings);
    f.end.addEventListener("change", refreshWarnings);
    refreshWarnings();
    return h("div", { class: "card v-admin-form" },
      h("div", { class: "card-title" }, slot ? "Edit slot" : "New slot"),
      slot ? h("p", { class: "small muted" }, "Picks are kept when you edit a slot. Editing closes when the slot locks.") : null,
      h("div", { class: "form-grid" },
        SB.ui.field("Start (MT)", f.start), SB.ui.field("End (MT)", f.end),
        SB.ui.field("Place", f.place),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "Booked spots, in order"), f.spots,
          h("span", { class: "field-hint" }, "Separate with commas. Table 1 gets the first spot, table 2 the second (D15).")),
        SB.ui.field("Type", f.vibe)),
      warnBox, msg,
      h("div", { class: "btn-group" },
        SB.ui.button(slot ? "Save slot" : "Add slot", function () {
          var d = draft();
          if (!d.start || !d.end) return showMsg(msg, "Enter a start and end time.");
          act(msg, function () { return SB.store.saveSlot(d); }, true);
        }),
        SB.ui.button("Cancel", closeForm, { kind: "secondary" })));
  }

  function slotRows(state, exam) {
    var slots = sorted(state.slots.filter(function (s) { return s.examId === exam.id; }), function (s) { return ms(s.start); });
    var rows = [];
    slots.forEach(function (slot) {
      var editable = slot.status === "open" && !(slot.jobs && slot.jobs.lockDone);
      var warnings = SB.rules.slotWarnings(state, slot);
      var lockAt = SB.clock.add(slot.start, { hours: -state.settings.lockHoursBefore });
      var sessions = state.sessions.filter(function (x) { return x.slotId === slot.id; });
      var count = SB.rules.slotCount(state, slot.id);
      rows.push(h("div", { class: ["v-admin-slot", slot.status === "dropped" && "v-admin-slot-dropped"] },
        h("div", { class: "row-between row-wrap" },
          h("span", { class: "strong" }, slotWhen(slot)),
          h("span", { class: "row" }, vibeTag(slot.vibe), statusTag(slot.status))),
        h("div", { class: "small" }, slot.place,
          h("span", { class: "muted" }, " · " + ((slot.spots || []).join(", ") || "No spots listed"))),
        h("div", { class: "small muted" },
          count + (count === 1 ? " pick" : " picks"),
          editable ? " · Locks " + SB.clock.fmt(lockAt, "dayTime") : "",
          slot.status === "locked" ? " · " + sessions.length + (sessions.length === 1 ? " table" : " tables") : ""),
        warnings.map(function (w) { return h("div", { class: "small warning" }, w); }),
        h("div", { class: "btn-group v-admin-actions" },
          h("a", { class: "btn btn-secondary btn-small", href: "#/admin/slot/" + encodeURIComponent(slot.id) }, "View"),
          editable
            ? SB.ui.button("Edit", function () { openForm("slot:" + slot.id); }, { kind: "secondary", class: "btn-small" })
            : h("span", { class: "small muted" }, "Can't edit after lock")),
        editKey === "slot:" + slot.id ? slotForm(state, slot) : null));
    });
    return rows;
  }

  function examBlock(state, exam) {
    var rows = slotRows(state, exam);
    return h("div", { class: "v-admin-exam" },
      h("div", { class: "row-between row-wrap" },
        h("div", null, h("span", { class: "exam-name" }, exam.name), " ",
          h("span", { class: "exam-date" }, fmt(exam.at, "full"))),
        h("div", { class: "btn-group" },
          SB.ui.button("Edit exam", function () { openForm("exam:" + exam.id); }, { kind: "secondary", class: "btn-small" }),
          SB.ui.button("Add slot", function () { openForm("slot:new:" + exam.id); }, { kind: "secondary", class: "btn-small" }))),
      editKey === "exam:" + exam.id ? examForm(state, exam) : null,
      editKey === "slot:new:" + exam.id ? slotForm(state, null, exam.id) : null,
      rows.length ? h("div", { class: "v-admin-slots" }, rows)
        : SB.ui.empty("No slots yet. Add candidate slots in the 5 days before the exam."));
  }

  function courseBlock(state, course) {
    var exams = sorted(state.exams.filter(function (e) { return e.courseId === course.id; }), function (e) { return ms(e.at); });
    var joined = state.students.filter(function (s) { return (s.courseIds || []).indexOf(course.id) >= 0; }).length;
    return h("div", { class: "card v-admin-course" },
      h("div", { class: "row-between row-wrap" },
        h("div", null,
          h("div", { class: "card-title" }, course.name, course.section ? " · Section " + course.section : ""),
          h("div", { class: "card-sub" },
            "Link code ", h("code", null, course.linkCode), " (#/join/" + course.linkCode + ") · ",
            course.enrolled + " enrolled · " + joined + " joined")),
        h("div", { class: "btn-group" },
          SB.ui.button("Edit course", function () { openForm("course:" + course.id); }, { kind: "secondary", class: "btn-small" }),
          SB.ui.button("Add exam", function () { openForm("exam:new:" + course.id); }, { kind: "secondary", class: "btn-small" }))),
      editKey === "course:" + course.id ? courseForm(state, course) : null,
      editKey === "exam:new:" + course.id ? examForm(state, null, course.id) : null,
      exams.length ? exams.map(function (e) { return examBlock(state, e); }) : SB.ui.empty("No exams yet."));
  }

  function renderCourses(params, mountEl) {
    var state = st();
    var el = root(mountEl, "Courses", "Now: " + fmt(SB.clock.now(), "full"));
    el.appendChild(inboxSection(state));
    var sec = h("section", { class: "v-admin-section" },
      h("div", { class: "row-between row-wrap" }, h("h2", null, "Courses, exams and slots"),
        SB.ui.button("Add course", function () { openForm("course:new"); }, { kind: "primary", class: "btn-small" })));
    if (editKey === "course:new") sec.appendChild(courseForm(state, null));
    var courses = sorted(state.courses, function (c) { return c.name + " " + c.section; });
    if (!courses.length) sec.appendChild(SB.ui.empty("No courses yet."));
    courses.forEach(function (c) { sec.appendChild(courseBlock(state, c)); });
    el.appendChild(sec);
    el.appendChild(pilotSection(state));
  }

  // ---------- #/admin/slot/:id ----------
  function renderSlot(params, mountEl) {
    var state = st();
    var slot = byId(state.slots, params.id);
    if (!slot) {
      var r = root(mountEl, "Slot not found");
      r.appendChild(SB.ui.empty("There's no slot with that ID."));
      r.appendChild(h("a", { class: "btn btn-secondary", href: "#/admin/courses" }, "Back to courses"));
      return;
    }
    var exam = examOfSlot(state, slot), course = courseOfExam(state, exam);
    var el = root(mountEl, slotWhen(slot),
      (course ? course.name + (course.section ? " · Section " + course.section : "") + " · " : "") + (exam ? exam.name : ""));
    el.insertBefore(h("a", { class: "btn-link v-admin-back", href: "#/admin/courses" }, "← Courses"), el.firstChild);

    var count = SB.rules.slotCount(state, slot.id);
    var sessions = sorted(state.sessions.filter(function (x) { return x.slotId === slot.id; }), function (x) { return x.table; });
    var lockAt = SB.clock.add(slot.start, { hours: -state.settings.lockHoursBefore });
    var result;
    if (slot.status === "open") result = "Open. Locks " + fmt(lockAt) + ".";
    else if (slot.status === "dropped") result = "Dropped at lock (" + fmt(lockAt) + "): fewer than " + state.settings.minGroup + " pickers.";
    else result = "Locked " + fmt(lockAt) + " into " + sessions.length + (sessions.length === 1 ? " table." : " tables.");

    el.appendChild(h("div", { class: "kpis" },
      h("div", { class: "kpi" }, h("div", { class: "kpi-label" }, "Picks"), h("div", { class: "kpi-value" }, String(count)),
        h("div", { class: "kpi-sub" }, "active or placed")),
      h("div", { class: "kpi" }, h("div", { class: "kpi-label" }, "Lock result"), h("div", { class: "v-admin-kpi-tag" }, statusTag(slot.status)),
        h("div", { class: "kpi-sub" }, result)),
      h("div", { class: "kpi" }, h("div", { class: "kpi-label" }, "Place"), h("div", { class: "strong" }, slot.place),
        h("div", { class: "kpi-sub" }, (slot.spots || []).join(", ") || "No spots listed", " · ", slot.vibe))));
    SB.rules.slotWarnings(state, slot).forEach(function (w) { el.appendChild(h("div", { class: "notice notice-warn" }, w)); });

    // Tables (sessions)
    if (sessions.length) {
      el.appendChild(h("h2", null, "Tables"));
      sessions.forEach(function (ses) {
        var seats = sorted(state.seats.filter(function (x) { return x.sessionId === ses.id; }), function (x) { return x.id; });
        var live = seats.filter(function (x) { return x.status !== "cancelled" && x.status !== "released"; }).length;
        var rows = seats.map(function (seat) {
          var s = byId(state.students, seat.studentId);
          var checks = sorted(state.checkins.filter(function (c) { return c.seatId === seat.id; }), function (c) { return ms(c.at); });
          return h("div", { class: ["v-admin-seat", (seat.status === "cancelled" || seat.status === "released") && "v-admin-seat-out"] },
            h("div", { class: "row-between row-wrap" },
              h("span", null, h("span", { class: "strong" }, personName(s)),
                h("span", { class: "small muted" }, s && s.year ? " · " + s.year : "")),
              seatTag(seat.status)),
            h("div", { class: "small muted v-admin-email" }, s ? s.email : "—"),
            seat.cancelReason ? h("div", { class: "small muted" }, "Cancelled (" + seat.cancelReason.replace(/_/g, " ") + ")" +
              (seat.cancelledAt ? " · " + fmt(seat.cancelledAt) : "")) : null,
            h("div", { class: "small" }, h("span", { class: "muted" }, "Confirmed: "),
              seat.confirmedAt ? fmt(seat.confirmedAt) : "not confirmed"),
            h("div", { class: "small row row-wrap" }, h("span", { class: "muted" }, "Check-in:"),
              checks.length ? checks.map(function (c) {
                return h("span", { class: "v-admin-check" }, checkinTag(c), h("span", { class: "muted" }, " " + fmt(c.at, "time")));
              }) : "none"));
        });
        el.appendChild(h("div", { class: "v-admin-table-head row-between row-wrap" },
          h("h3", null, "Table " + ses.table + " · " + ses.spot),
          h("span", { class: "small muted" }, live + " still in · " + seats.length + " seated")));
        el.appendChild(rows.length ? h("div", { class: "v-admin-seats" }, rows) : SB.ui.empty("No seats at this table."));
      });
    }

    // Picks
    el.appendChild(h("h2", null, "Picks"));
    var picks = sorted(state.picks.filter(function (p) { return p.slotId === slot.id; }), function (p) { return ms(p.at); });
    el.appendChild(tableWrap(["Student", "Picked", "Status"], picks.map(function (p) {
      var s = byId(state.students, p.studentId);
      return h("tr", { class: p.status === "removed" ? "muted" : null },
        h("td", null, h("div", { class: "strong" }, personName(s)), h("div", { class: "small muted v-admin-email" }, s ? s.email : "—")),
        h("td", null, fmt(p.at)),
        h("td", null, p.status.replace("_", " "), p.removedReason ? h("div", { class: "small muted" }, p.removedReason.replace("_", " ")) : null));
    }), "No one has picked this slot."));
  }

  // ---------- #/admin/review ----------
  function seatInfo(state, seatId) {
    var seat = byId(state.seats, seatId);
    var ses = seat ? byId(state.sessions, seat.sessionId) : null;
    var slot = slotOfSession(state, ses);
    return { seat: seat, session: ses, slot: slot, student: seat ? byId(state.students, seat.studentId) : null };
  }
  function decisionTag(d) {
    return h("span", { class: ["tag", d === "accepted" ? "tag-ok" : "tag-bad"] }, d);
  }

  function renderReview(params, mountEl) {
    var state = st();
    var el = root(mountEl, "Review", "Unverified check-ins count as attended unless you reject them. A rejection makes the seat a no-show with a strike (D11).");
    var msg = msgBox();
    el.appendChild(msg);

    var unverified = sorted(state.checkins.filter(function (c) { return c.result === "unverified"; }), function (c) { return -ms(c.at); });
    var pendingC = unverified.filter(function (c) { return !c.adminDecision; });
    var doneC = unverified.filter(function (c) { return c.adminDecision; });

    el.appendChild(h("h2", null, "Unverified check-ins (" + pendingC.length + " waiting)"));
    if (!pendingC.length) el.appendChild(SB.ui.empty("No check-ins waiting for review."));
    pendingC.forEach(function (c) {
      var x = seatInfo(state, c.seatId);
      el.appendChild(SB.ui.card(
        h("div", { class: "card-title" }, personName(x.student), " ", h("span", { class: "small muted v-admin-email" }, x.student ? x.student.email : "")),
        h("div", { class: "card-sub" }, slotLabel(state, x.slot), x.session ? " · Table " + x.session.table + " · " + x.session.spot : ""),
        h("p", { class: "small" }, "Tapped I'm here at " + fmt(c.at) + ". Location was denied or failed."),
        h("div", { class: "card-actions" },
          SB.ui.button("Accept", function () { act(msg, function () { return SB.store.decideCheckin(c.id, "accepted"); }); }),
          SB.ui.button("Reject (no-show + strike)", function () { act(msg, function () { return SB.store.decideCheckin(c.id, "rejected"); }); }, { kind: "danger" }),
          x.slot ? h("a", { class: "btn btn-secondary", href: "#/admin/slot/" + encodeURIComponent(x.slot.id) }, "View slot") : null)));
    });

    var reports = sorted(state.reports || [], function (r) { return -ms(r.at); });
    var pendingR = reports.filter(function (r) { return !r.adminDecision; });
    var doneR = reports.filter(function (r) { return r.adminDecision; });
    el.appendChild(h("h2", { class: "mt" }, "Reports (" + pendingR.length + " waiting)"));
    if (!pendingR.length) el.appendChild(SB.ui.empty("No reports waiting for review."));
    pendingR.forEach(function (r) {
      var by = byId(state.students, r.byStudentId), about = byId(state.students, r.aboutStudentId);
      var ses = byId(state.sessions, r.sessionId), slot = slotOfSession(state, ses);
      el.appendChild(SB.ui.card(
        h("div", { class: "card-title" }, personName(by), " reported ", personName(about)),
        h("div", { class: "card-sub" }, slotLabel(state, slot), ses ? " · Table " + ses.table : "", " · " + fmt(r.at)),
        h("p", { class: "small v-admin-email" }, "By: " + (by ? by.email : "—") + " · About: " + (about ? about.email : "—")),
        h("p", null, r.text ? r.text : h("span", { class: "muted" }, "(No text)")),
        h("p", { class: "small muted" }, "Accepting records the decision only (Still open #11)."),
        h("div", { class: "card-actions" },
          SB.ui.button("Accept", function () { act(msg, function () { return SB.store.decideReport(r.id, "accepted"); }); }),
          SB.ui.button("Reject", function () { act(msg, function () { return SB.store.decideReport(r.id, "rejected"); }); }, { kind: "danger" }))));
    });

    if (doneC.length || doneR.length) {
      el.appendChild(h("h2", { class: "mt" }, "Reviewed"));
      var rows = [];
      doneC.forEach(function (c) {
        var x = seatInfo(state, c.seatId);
        rows.push(h("tr", null, h("td", null, "Check-in"), h("td", null, personName(x.student)),
          h("td", null, slotLabel(state, x.slot)), h("td", null, decisionTag(c.adminDecision))));
      });
      doneR.forEach(function (r) {
        var about = byId(state.students, r.aboutStudentId), ses = byId(state.sessions, r.sessionId);
        rows.push(h("tr", null, h("td", null, "Report"), h("td", null, "About " + personName(about)),
          h("td", null, slotLabel(state, slotOfSession(state, ses))), h("td", null, decisionTag(r.adminDecision))));
      });
      el.appendChild(tableWrap(["Kind", "Student", "Session", "Decision"], rows));
    }
  }

  // ---------- #/admin/strikes ----------
  function renderStrikes(params, mountEl) {
    var state = st();
    var s = state.settings;
    var el = root(mountEl, "Strikes",
      "Strike " + s.strikeWarnAt + " sends a warning. Strike " + s.strikePauseAt + " pauses sign-ups for " + s.strikePauseDays +
      " days. Removing a strike that brings a student below " + s.strikePauseAt + " lifts the pause (D22).");
    var msg = msgBox();
    el.appendChild(msg);
    var byStudent = {};
    (state.strikes || []).forEach(function (k) { (byStudent[k.studentId] = byStudent[k.studentId] || []).push(k); });
    var ids = Object.keys(byStudent);
    if (!ids.length) { el.appendChild(SB.ui.empty("No strikes.")); return; }
    var now = SB.clock.now();
    ids.sort(function (a, b) {
      var d = SB.rules.activeStrikes(state, b) - SB.rules.activeStrikes(state, a);
      if (d) return d;
      var na = personName(byId(state.students, a)), nb = personName(byId(state.students, b));
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    ids.forEach(function (id) {
      var stu = byId(state.students, id);
      var active = SB.rules.activeStrikes(state, id);
      var paused = SB.rules.isPaused(state, now, id);
      var list = sorted(byStudent[id], function (k) { return ms(k.at); });
      var rows = list.map(function (k) {
        var x = seatInfo(state, k.seatId);
        return h("tr", { class: k.removed ? "muted" : null },
          h("td", null, h("div", { class: "strong small" }, "Given " + fmt(k.at)), h("div", { class: "small" }, slotLabel(state, x.slot)), x.seat ? h("div", { class: "small muted" }, "Seat: " + x.seat.status.replace("_", "-")) : null),
          h("td", null, k.removed ? h("span", { class: "tag tag-muted" }, "removed") : h("span", { class: "tag tag-bad" }, "active")),
          h("td", null, k.removed ? null : SB.ui.button("Remove", function () {
            act(msg, function () { return SB.store.removeStrike(k.id); });
          }, { kind: "danger", class: "btn-small" })));
      });
      el.appendChild(SB.ui.card(
        h("div", { class: "row-between row-wrap" },
          h("div", null, h("div", { class: "card-title" }, personName(stu)),
            h("div", { class: "card-sub v-admin-email" }, stu ? stu.email : "")),
          h("div", { class: "row row-wrap" },
            h("span", { class: ["tag", active >= s.strikePauseAt ? "tag-bad" : active >= s.strikeWarnAt ? "tag-warn" : "tag-muted"] },
              active + (active === 1 ? " active strike" : " active strikes")),
            paused ? h("span", { class: "tag tag-bad" }, "Paused until " + fmt(stu.pausedUntil)) : null)),
        tableWrap(["Strike", "Status", ""], rows)));
    });
  }

  // ---------- #/admin/metrics ----------
  var METRICS = [
    { key: "signupConversion", label: "Sign-up conversion", def: "Finished sign-ups ÷ enrolled", target: "15% or more", kind: "pct", goal: function (v) { return v >= 0.15; } },
    { key: "matchRate", label: "Match rate", def: "Students placed ÷ students whose picks were decided", target: "80% or more", kind: "pct", goal: function (v) { return v >= 0.8; } },
    { key: "showUpRate", label: "Show-up rate", def: "Valid check-ins ÷ confirmed at session start", target: "60% or more", kind: "pct", goal: function (v) { return v >= 0.6; } },
    { key: "repeatUse", label: "Repeat use", def: "Attend before a second exam ÷ attended before the first", target: "40% or more", kind: "pending" },
    { key: "betterPrepared", label: "Better prepared", def: "\"More prepared\" ÷ all post-session answers", target: "70% or more", kind: "pct", goal: function (v) { return v >= 0.7; } },
    { key: "connection", label: "Connection", def: "Exit \"yes\" share minus intake \"yes\" share (answered both)", target: "Any increase", kind: "pts", goal: function (v) { return v > 0; } },
    { key: "noShowRate", label: "No-show rate", def: "No-shows ÷ seats ever confirmed", target: "Under 20%", kind: "pct", goal: function (v) { return v < 0.2; } },
    { key: "nps", label: "NPS", def: "% scoring 9–10 minus % scoring 0–6", target: "+30 or higher", kind: "nps", goal: function (v) { return v >= 30; } }
  ];

  function fmtValue(def, m) {
    if (def.kind === "pending" || m == null) return "Waiting on a decision";
    if (m.value == null) return "—";
    if (def.kind === "pct") return Math.round(m.value * 100) + "%";
    if (def.kind === "pts") { var p = Math.round(m.value * 100); return (p > 0 ? "+" : "") + p + " pts"; }
    var n = Math.round(m.value); return (n > 0 ? "+" : "") + n;
  }
  function fmtFrac(def, m) {
    if (def.kind === "pending" || m == null) return "Still open #7";
    if (def.kind === "nps") return m.den + (m.den === 1 ? " answer" : " answers");
    if (def.kind === "pts") return m.den ? "net " + m.num + " of " + m.den + " who answered both" : "0 answered both surveys";
    return m.num + " / " + m.den;
  }
  function goalTag(def, m) {
    if (def.kind === "pending" || m == null || m.value == null || !def.goal) return null;
    var hit = def.goal(m.value);
    return h("span", { class: ["tag", hit ? "tag-ok" : "tag-warn"] }, hit ? "on target" : "below target");
  }

  function renderMetrics(params, mountEl) {
    var state = st();
    var res = SB.rules.metrics(state);
    var el = root(mountEl, "Pilot metrics", "As of " + fmt(SB.clock.now(), "full") + ". \"—\" means there's nothing to count yet.");

    el.appendChild(h("h2", null, "Overall"));
    el.appendChild(h("div", { class: "kpis" }, METRICS.map(function (def) {
      var m = res.overall[def.key];
      return h("div", { class: ["kpi", def.kind === "pending" && "v-admin-pending"] },
        h("div", { class: "kpi-label" }, def.label),
        h("div", { class: ["kpi-value", def.kind === "pending" && "v-admin-pending-value"] }, fmtValue(def, m)),
        h("div", { class: "kpi-sub" }, fmtFrac(def, m)),
        h("div", { class: "kpi-sub" }, "Target: " + def.target, " ", goalTag(def, m)),
        h("div", { class: "kpi-sub v-admin-def" }, def.def));
    })));

    var courses = sorted(state.courses, function (c) { return c.name + " " + c.section; });
    el.appendChild(h("h2", null, "By course"));
    var head = ["Metric", "Target"].concat(courses.map(function (c) { return c.name.split(":")[0] + (c.section ? " · " + c.section : ""); }));
    var rows = METRICS.map(function (def) {
      return h("tr", null,
        h("td", { class: "strong" }, def.label),
        h("td", { class: "small muted" }, def.target),
        courses.map(function (c) {
          var m = res.byCourse[c.id] ? res.byCourse[c.id][def.key] : null;
          return h("td", null, h("div", { class: def.kind === "pending" ? "muted small" : "strong" }, fmtValue(def, m)),
            h("div", { class: "small muted" }, fmtFrac(def, m)));
        }));
    });
    el.appendChild(tableWrap(head, rows, "No courses yet."));
  }

  // ---------- register ----------
  SB.router.register("/admin/courses", renderCourses);
  SB.router.register("/admin/slot/:id", renderSlot);
  SB.router.register("/admin/review", renderReview);
  SB.router.register("/admin/strikes", renderStrikes);
  SB.router.register("/admin/metrics", renderMetrics);
})();
