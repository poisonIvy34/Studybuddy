/* js/views/exams.js — the student's exam view (#/exams) and the session screen (#/session/:id).
 *
 * Every decision (what is listed, who can pick, which seat buttons show, who the tablemates are)
 * comes from SB.rules. This file only draws what rules return and calls SB.store actions.
 * Privacy: slots show counts only; tablemates show first name and year only (D12). Nothing about
 * another student's status, email, strikes or check-ins is ever drawn here.
 */
(function () {
  var SB = (window.SB = window.SB || {});

  // Screen-local UI state (not product state): a message to show after an action,
  // the open report form and its draft, and the pending "Cancel?" question.
  var flash = null;          // { path, kind: "ok" | "error" | "warn" | "info", text }
  var reportOpen = null;     // studentId whose report form is open
  var reportDraft = "";
  var cancelAsk = null;      // seatId awaiting "are you sure"

  function h() { return SB.ui.h.apply(null, arguments); }
  function fmt(iso, kind) { return SB.clock.fmt(iso, kind); }
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function path() { var p = String(window.location.hash || "").replace(/^#/, ""); return p || "/exams"; }

  function setFlash(kind, text) { flash = { path: path(), kind: kind, text: text }; }
  function takeFlash() {
    if (!flash || flash.path !== path()) { flash = null; return null; }
    var f = flash; flash = null;
    return h("div", { class: ["notice", "notice-" + f.kind], role: "status" }, f.text);
  }

  // Runs a store action; on failure shows its error, on success an optional message.
  function act(result, okText) {
    if (result && result.ok) {
      if (okText) setFlash("ok", okText);
      SB.router.render();
      return true;
    }
    setFlash("error", (result && result.error) || "Something went wrong.");
    SB.router.render();
    return false;
  }

  function whenText(slot) { return fmt(slot.start, "dayTime") + " – " + fmt(slot.end, "time"); }
  function vibeTag(vibe) { return h("span", { class: ["tag", "tag-" + vibe] }, vibe === "quiet" ? "Quiet" : "Chatty"); }
  function courseLabel(course) { return course ? course.name + (course.section ? " · Sec " + course.section : "") : ""; }

  // ---------- seat status in friendly words (the student's own seat only) ----------
  var STATUS_TAG = {
    placed: ["You're in", "tag-info"],
    confirmed: ["Confirmed", "tag-ok"],
    attended: ["Checked in", "tag-ok"],
    cancelled: ["Cancelled", "tag-muted"],
    released: ["Released", "tag-muted"],
    no_show: ["Missed", "tag-bad"]
  };
  function statusTag(seat) {
    var t = STATUS_TAG[seat.status] || [seat.status, "tag-muted"];
    return h("span", { class: ["tag", t[1]] }, t[0]);
  }

  function statusText(state, now, seat, slot, actions) {
    var s = state.settings;
    var n = SB.clock.toMs(now), T = SB.clock.toMs(slot.start);
    switch (seat.status) {
      case "placed":
        if (actions.canConfirm) return "Still coming? Let your table know.";
        if (n < T) return "You're in. We'll ask you to confirm at " +
          fmt(SB.clock.add(slot.start, { minutes: -s.confirmMinutesBefore }), "dayTime") + ".";
        return "You're in.";
      case "confirmed":
        if (actions.canCheckIn) return "You're confirmed. Tap I'm here when you reach the spot.";
        if (n < T) return "You're confirmed. I'm here opens at " +
          fmt(SB.clock.add(slot.start, { minutes: -s.checkInOpensMinutesBefore }), "time") + ".";
        return "You're confirmed.";
      case "attended": return "You checked in. Thanks for coming!";
      case "cancelled":
        if (seat.cancelReason === "cant_make_it") return "You told us you can't make it. No strike.";
        if (seat.cancelReason === "strike_pause") return "Cancelled because your sign-ups are paused.";
        return "You cancelled this session. No strike.";
      case "released": return "You didn't confirm in time, so your seat was released. No strike.";
      case "no_show": return "You confirmed but didn't check in, so this counted as a no-show.";
      default: return "";
    }
  }

  // The latest check-in attempt for the student's own seat, as a message.
  function checkinNotice(state, seat) {
    var mine = state.checkins.filter(function (c) { return c.seatId === seat.id; });
    if (!mine.length) return null;
    var last = mine.slice().sort(function (a, b) {
      return SB.clock.toMs(a.at) - SB.clock.toMs(b.at) || (a.id < b.id ? -1 : 1);
    })[mine.length - 1];
    var at = " (" + fmt(last.at, "time") + ")";
    if (last.result === "in_range") return h("div", { class: "notice notice-ok" }, "You're checked in" + at + ".");
    if (last.result === "unverified") {
      if (last.adminDecision === "rejected") {
        return h("div", { class: "notice notice-error" }, "Your check-in" + at + " couldn't be verified and was not accepted.");
      }
      return h("div", { class: "notice notice-warn" },
        "We couldn't read your location, so your check-in" + at + " counts for now and will be reviewed.");
    }
    if (seat.status === "attended") return null; // an earlier failed try, already superseded
    return h("div", { class: "notice notice-error" },
      "You're not at the spot yet" + at + ". Get closer and tap I'm here again.");
  }

  // ---------- #/exams ----------
  function suggestionCards(state, now, me) {
    var seen = {};
    return state.notifications
      .filter(function (n) { return n.to === me && n.kind === "slot_dropped" && n.suggestedSlotId; })
      .slice().reverse()
      .filter(function (n) {
        if (seen[n.suggestedSlotId]) return false;
        if (!SB.rules.canPick(state, now, me, n.suggestedSlotId)) return false;
        seen[n.suggestedSlotId] = true;
        return true;
      })
      .map(function (n) {
        var sug = find(state.slots, n.suggestedSlotId);
        var exam = sug && find(state.exams, sug.examId);
        if (!sug) return null;
        return h("div", { class: "card v-exams-suggest" },
          h("div", { class: "section-title" }, "A slot was dropped"),
          h("p", { class: "small" }, n.text),
          h("div", { class: "row-between v-exams-suggest-row" },
            h("div", { class: "grow" },
              h("div", { class: "strong" }, whenText(sug)),
              h("div", { class: "muted small" }, (exam ? exam.name + " · " : "") + sug.place)),
            SB.ui.button("Pick this time", function () {
              act(SB.store.pick(sug.id), "Picked " + fmt(sug.start, "dayTime") + ".");
            }, { kind: "primary", class: "btn-small" })));
      })
      .filter(Boolean);
  }

  function sessionCard(state, now, item) {
    var seat = item.seat, slot = item.slot;
    var link = "#/session/" + item.session.id;
    var post = SB.rules.postOpen(state, now, seat.id);
    return h("a", { class: ["card", "session-card", "v-exams-session", "v-exams-st-" + seat.status], href: link },
      h("div", { class: "row-between" },
        h("div", { class: "session-when" }, whenText(slot)),
        statusTag(seat)),
      h("div", { class: "muted small" }, (item.exam ? item.exam.name : "") + (item.course ? " · " + item.course.name : "")),
      h("div", { class: "session-spot" }, slot.place + " · " + item.session.spot),
      post ? h("div", { class: "v-exams-post" }, "How did it go? Tap to answer.") : null);
  }

  function slotRow(item, paused) {
    var slot = item.slot;
    var disabled = paused || (!item.picked && !item.canPick);
    var input = h("input", {
      type: "checkbox",
      checked: item.picked,
      disabled: disabled,
      "aria-label": (item.picked ? "Remove pick for " : "Pick ") + whenText(slot),
      onchange: function (e) {
        var r = e.target.checked ? SB.store.pick(slot.id) : SB.store.unpick(slot.id);
        act(r);
      }
    });
    return h("div", { class: ["slot", item.picked && "picked", disabled && !item.picked && "disabled"] },
      h("div", { class: "slot-main" },
        h("div", { class: "slot-time" }, whenText(slot)),
        h("div", { class: "slot-place" }, slot.place),
        h("div", { class: "slot-meta" },
          vibeTag(slot.vibe),
          item.preferred ? h("span", { class: "tag tag-pref" }, "Your type") : null,
          h("span", { class: "slot-count" }, item.count + (item.count === 1 ? " person" : " people") + " picked"))),
      h("label", { class: "slot-toggle toggle" }, input, h("span", { class: "toggle-ui" })));
  }

  function renderExams(params, mount) {
    var state = SB.store.get(), now = SB.clock.now(), me = state.demo.currentUserId;
    var data = SB.rules.examsFor(state, now, me);
    var root = h("div", { class: "v-exams" });

    root.appendChild(h("h1", null, "Your exams"));
    var f = takeFlash(); if (f) root.appendChild(f);

    if (data.pausedUntil) {
      root.appendChild(h("div", { class: "notice notice-warn" },
        "Sign-ups are paused until " + fmt(data.pausedUntil, "full") + ". You can't pick times until then."));
    }

    suggestionCards(state, now, me).forEach(function (c) { root.appendChild(c); });

    var upcoming = data.sessions.filter(function (s) { return s.upcoming; });
    var past = data.sessions.filter(function (s) { return !s.upcoming; }).reverse();
    if (upcoming.length) {
      root.appendChild(h("div", { class: "section-title" }, "Your sessions"));
      root.appendChild(h("div", { class: "v-exams-sessions" }, upcoming.map(function (s) { return sessionCard(state, now, s); })));
    }
    if (past.length) {
      var open = past.some(function (s) { return SB.rules.postOpen(state, now, s.seat.id); });
      root.appendChild(h("details", { class: "v-exams-past", open: open },
        h("summary", null, "Past sessions (" + past.length + ")"),
        h("div", { class: "v-exams-sessions" }, past.map(function (s) { return sessionCard(state, now, s); }))));
    }

    if (data.noCourses) {
      root.appendChild(SB.ui.empty("Open your course link to add a course."));
    } else if (!data.exams.length) {
      root.appendChild(SB.ui.empty("No upcoming exams in your courses right now."));
    } else {
      root.appendChild(h("div", { class: "section-title" }, "Pick study times"));
      root.appendChild(h("p", { class: "muted small" },
        "Pick as many times as you like. A time becomes a session 48 hours before it starts if 3 or more people picked it."));
      data.exams.forEach(function (e) {
        root.appendChild(h("section", { class: "exam" },
          h("div", { class: "exam-head" },
            h("div", null,
              h("div", { class: "exam-name" }, e.exam.name),
              h("div", { class: "muted small" }, courseLabel(e.course))),
            h("div", { class: "exam-date" }, fmt(e.exam.at, "day"))),
          e.slots.length
            ? h("div", { class: "slot-list" }, e.slots.map(function (s) { return slotRow(s, !!data.pausedUntil); }))
            : SB.ui.empty("No open times for this exam right now.")));
      });
    }

    mount.appendChild(root);
  }

  // ---------- #/session/:id ----------
  function renderSession(params, mount) {
    var state = SB.store.get(), now = SB.clock.now(), me = state.demo.currentUserId;
    var root = h("div", { class: "v-exams" });
    var back = h("a", { class: "btn-link v-exams-back", href: "#/exams" }, "‹ Exams");
    root.appendChild(back);

    var session = find(state.sessions, params.id);
    var seat = session && state.seats.filter(function (x) { return x.sessionId === session.id && x.studentId === me; })[0];
    var slot = session && find(state.slots, session.slotId);
    if (!session || !seat || !slot) {
      root.appendChild(SB.ui.card(h("h2", null, "Session not found"),
        h("p", { class: "muted" }, "This session isn't one of yours.")));
      mount.appendChild(root);
      return;
    }
    if (cancelAsk && cancelAsk !== seat.id) cancelAsk = null;

    var exam = find(state.exams, slot.examId);
    var course = exam && find(state.courses, exam.courseId);
    var actions = SB.rules.seatActions(state, now, seat.id);

    var f = takeFlash(); if (f) root.appendChild(f);

    // Details
    var spotKnown = session.spot && session.spot !== "To be announced";
    root.appendChild(h("div", { class: "card session-card v-exams-detail" },
      h("div", { class: "row-between" },
        h("div", { class: "muted small" }, (exam ? exam.name : "") + (course ? " · " + course.name : "")),
        statusTag(seat)),
      h("div", { class: "session-when" }, whenText(slot)),
      h("div", { class: "session-spot" }, slot.place),
      h("div", { class: "row row-wrap v-exams-tags" },
        h("span", { class: "tag tag-muted" }, "Table " + session.table),
        spotKnown ? h("span", { class: "tag tag-info" }, session.spot)
                  : h("span", { class: "tag tag-warn" }, "Spot: to be announced"),
        vibeTag(slot.vibe)),
      h("p", { class: "status-line" }, statusText(state, now, seat, slot, actions))));

    var cn = checkinNotice(state, seat); if (cn) root.appendChild(cn);

    // Actions, exactly as rules allow
    var btns = [];
    if (actions.canConfirm) {
      btns.push(SB.ui.button("Confirm", function () { act(SB.store.confirm(seat.id), "Confirmed. See you there!"); }, { kind: "primary" }));
      btns.push(SB.ui.button("Can't make it", function () {
        act(SB.store.cantMakeIt(seat.id), "Got it. Your table will know you can't make it. No strike.");
      }, { kind: "secondary" }));
    }
    if (actions.canCheckIn) {
      btns.push(SB.ui.button("I'm here", function () {
        var r = SB.store.checkIn(seat.id);
        if (!r.ok) act(r); else SB.router.render(); // the check-in notice shows the result
      }, { kind: "primary", class: "v-exams-here" }));
    }
    if (btns.length) root.appendChild(h("div", { class: "btn-group v-exams-actions" }, btns));

    if (actions.canCancel) {
      if (cancelAsk === seat.id) {
        root.appendChild(h("div", { class: "notice notice-warn v-exams-cancel-ask" },
          h("div", null, "Cancel your seat at this session? Cancelling before it starts never gives a strike."),
          h("div", { class: "btn-group mt" },
            SB.ui.button("Yes, cancel", function () {
              cancelAsk = null;
              act(SB.store.cancel(seat.id), "You cancelled this session.");
            }, { kind: "danger", class: "btn-small" }),
            SB.ui.button("Keep my seat", function () { cancelAsk = null; SB.router.render(); },
              { kind: "secondary", class: "btn-small" }))));
      } else {
        root.appendChild(h("div", { class: "v-exams-cancel" },
          SB.ui.button("Cancel my seat", function () { cancelAsk = seat.id; SB.router.render(); }, { kind: "danger", class: "btn-small" })));
      }
    }

    if (SB.rules.postOpen(state, now, seat.id) && !state.postAnswers.some(function (a) { return a.seatId === seat.id; })) {
      root.appendChild(h("a", { class: "btn btn-primary btn-block v-exams-postlink", href: "#/after/" + session.id },
        "How did it go? Answer one question"));
    }

    // Tablemates: first name + year only, own table only
    var mates = SB.rules.tablemates(state, now, seat.id);
    var reported = {};
    state.reports.forEach(function (r) { if (r.sessionId === session.id && r.byStudentId === me) reported[r.aboutStudentId] = true; });
    var list = mates.length
      ? h("ul", { class: "mates" }, mates.map(function (m) { return mateRow(session, m, actions.canReport, reported[m.studentId]); }))
      : SB.ui.empty("No one else is at your table.");
    root.appendChild(h("div", { class: "card v-exams-mates" },
      h("div", { class: "card-title" }, "Your table"),
      list));

    mount.appendChild(root);
  }

  function mateRow(session, m, canReport, already) {
    var open = reportOpen === m.studentId && canReport;
    var right = already
      ? h("span", { class: "tag tag-muted" }, "Reported")
      : canReport && !open
        ? SB.ui.button("Report", function () { reportOpen = m.studentId; reportDraft = ""; SB.router.render(); },
            { kind: "secondary", class: "btn-small" })
        : null;
    var li = h("li", { class: "mate v-exams-mate" },
      h("div", { class: "v-exams-mate-head" },
        h("div", null, h("span", { class: "mate-name" }, m.firstName || "Someone"), h("span", { class: "mate-year" }, m.year || "")),
        right));
    if (open) {
      var ta = h("textarea", {
        placeholder: "What happened? (optional)",
        "aria-label": "Report details (optional)",
        oninput: function (e) { reportDraft = e.target.value; }
      });
      ta.value = reportDraft;
      li.appendChild(h("div", { class: "v-exams-report" },
        h("p", { class: "small muted" }, "Reports are private. Only the StudyBuddy team sees them."),
        ta,
        h("div", { class: "btn-group mt" },
          SB.ui.button("Send report", function () {
            var text = reportDraft.trim();
            reportOpen = null; reportDraft = "";
            act(SB.store.report(session.id, m.studentId, text), "Report sent. The StudyBuddy team will review it.");
          }, { kind: "danger", class: "btn-small" }),
          SB.ui.button("Never mind", function () { reportOpen = null; reportDraft = ""; SB.router.render(); },
            { kind: "secondary", class: "btn-small" }))));
    }
    return li;
  }

  SB.router.register("/exams", renderExams);
  SB.router.register("/session/:id", function (params, mount) {
    if (reportOpen && renderSession.lastId !== params.id) { reportOpen = null; reportDraft = ""; }
    renderSession.lastId = params.id;
    renderSession(params, mount);
  });
})();
