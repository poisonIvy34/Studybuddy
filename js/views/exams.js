/* js/views/exams.js — the Study tab (#/exams: study sessions by class, D44) and the session screen (#/session/:id).
 *
 * Every decision (what is listed, who can pick, which seat buttons show, who the tablemates are)
 * comes from SB.rules. This file only draws what rules return and calls SB.store actions.
 * Privacy: slots show counts only; tablemates show first name and year only (D12). Nothing about
 * another student's status, email, misses or check-ins is ever drawn here.
 */
(function () {
  var SB = (window.SB = window.SB || {});

  // Screen-local UI state (not product state): a message to show after an action,
  // and the open report form and its draft.
  var flash = null;          // { path, kind: "ok" | "error" | "warn" | "info", text }
  var reportOpen = null;     // studentId whose report form is open
  var reportDraft = "";

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
  function shortName(course) { return course ? course.name.split(":")[0] : ""; }
  function courseTitle(course) {
    if (!course) return "";
    var parts = course.name.split(":");
    return (parts[1] ? parts[1].trim() : course.name) + (course.section ? " · Sec " + course.section : "");
  }

  // ---------- seat status in friendly words (the student's own seat only) ----------
  var STATUS_TAG = {
    placed: ["You're in", "tag-info"],
    confirmed: ["Still coming", "tag-ok"],
    attended: ["You came", "tag-ok"],
    cancelled: ["Can't make it", "tag-muted"],
    released: ["Seat released", "tag-muted"],
    no_show: ["Missed", "tag-warn"]
  };
  function statusTag(seat) {
    var t = STATUS_TAG[seat.status] || [seat.status, "tag-muted"];
    return h("span", { class: ["tag", t[1]] }, t[0]);
  }

  function statusText(state, now, seat, slot, actions) {
    var s = state.settings;
    var n = SB.clock.toMs(now), T = SB.clock.toMs(slot.start), E = SB.clock.toMs(slot.end);
    switch (seat.status) {
      case "placed":
        if (seat.earlyConfirm && actions.canConfirm) return "Your group is counting on you. Please tap Still coming by " +
          fmt(SB.clock.add(slot.start, { hours: -s.earlyConfirmByHoursBefore }), "dayTime") + " to keep your seat.";
        if (actions.canConfirm && actions.canCheckIn) return "Still coming? Let your group know, or tap I'm here once you reach the spot.";
        if (actions.canConfirm) return "Still coming? Let your group know.";
        if (n < T) return "You're in. We'll ask if you're still coming at " +
          fmt(SB.clock.add(slot.start, { minutes: -s.confirmMinutesBefore }), "dayTime") + ".";
        return "You're in.";
      case "confirmed":
        if (actions.canCheckIn) return "Your group knows you're coming. Tap I'm here when you reach the spot.";
        if (n < T) return "Your group knows you're coming. I'm here opens at " +
          fmt(SB.clock.add(slot.start, { minutes: -s.checkInOpensMinutesBefore }), "time") + ".";
        if (n >= E) return "The session's over. If you were there, a tablemate can still say you studied together until " +
          fmt(SB.clock.add(slot.end, { hours: s.postWindowHours }), "dayTime") + ".";
        return "Your group knows you're coming.";
      case "attended": return "You made it. Thanks for showing up for your group!";
      case "cancelled":
        if (seat.cancelReason === "cant_make_it" || seat.cancelReason === "student") {
          return "No problem, we let your group know. Thanks for the heads-up!";
        }
        return "This seat was cancelled.";
      case "released": return "We didn't hear back, so your seat was released. That's not a miss.";
      case "no_show": return "You said you were coming but nobody saw you there, so this counted as a miss. Life happens!";
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
        var course = sug && find(state.courses, sug.courseId);
        if (!sug) return null;
        return h("div", { class: "card v-exams-suggest" },
          h("div", { class: "section-title" }, "A slot was dropped"),
          h("p", { class: "small" }, n.text),
          h("div", { class: "row-between v-exams-suggest-row" },
            h("div", { class: "grow" },
              h("div", { class: "strong" }, whenText(sug)),
              h("div", { class: "muted small" }, (course ? shortName(course) + " · " : "") + sug.place)),
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
      h("div", { class: "muted small" }, item.course ? item.course.name : ""),
      h("div", { class: "session-spot" }, slot.place + " · " + item.session.spot),
      post ? h("div", { class: "v-exams-post" }, "How did it go? Tap to answer.") : null);
  }

  // A session happening today: status plus the actions the rules allow right now (seatActions).
  function todayCard(state, now, item) {
    var seat = item.seat, slot = item.slot, session = item.session;
    var actions = SB.rules.seatActions(state, now, seat.id);
    var btns = [];
    if (actions.canCheckIn) {
      btns.push(SB.ui.button("I'm here", function () {
        act(SB.store.checkIn(seat.id));
      }, { kind: "primary" }));
    }
    if (actions.canConfirm) {
      btns.push(SB.ui.button("Still coming", function () {
        act(SB.store.confirm(seat.id), "Great, your group knows you're coming. See you there!");
      }, { kind: actions.canCheckIn ? "secondary" : "primary" }));
    }
    if (actions.canCantMakeIt || actions.canCancel) {
      btns.push(SB.ui.button("Can't make it", function () {
        act(actions.canCantMakeIt ? SB.store.cantMakeIt(seat.id) : SB.store.cancel(seat.id),
          "No problem, we'll let your group know. Thanks for the heads-up!");
      }, { kind: "secondary" }));
    }
    var mates = SB.rules.tablemates(state, now, seat.id).map(function (m) { return m.firstName; }).filter(Boolean);
    return h("div", { class: ["card", "session-card", "v-exams-today", "v-exams-st-" + seat.status] },
      h("div", { class: "row-between" },
        h("span", { class: "tag v-exams-today-tag" }, "Today"),
        statusTag(seat)),
      h("div", { class: "session-when" }, whenText(slot)),
      h("div", { class: "muted small" }, item.course ? item.course.name : ""),
      h("div", { class: "session-spot" }, slot.place + " · " + session.spot),
      mates.length ? h("div", { class: "small v-exams-today-mates" }, "With " + mates.join(", ")) : null,
      h("p", { class: "status-line" }, statusText(state, now, seat, slot, actions)),
      checkinNotice(state, seat),
      btns.length ? h("div", { class: "btn-group v-exams-today-actions" }, btns) : null,
      h("a", { class: "btn-link small v-exams-today-link", href: "#/session/" + session.id }, "Session details ›"));
  }

  function slotRow(item) {
    var slot = item.slot;
    var disabled = !item.picked && !item.canPick;
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

  // D42: one sample ad for a made-up local business, one per MT calendar day, in seed order.
  function adCard(state, now) {
    var ads = state.ads || [];
    if (!ads.length) return null;
    var dayNum = Math.floor(Date.UTC(+now.slice(0, 4), +now.slice(5, 7) - 1, +now.slice(8, 10)) / 86400000);
    var ad = ads[dayNum % ads.length];
    return h("aside", { class: "v-exams-ad", "aria-label": "Sample ad" },
      h("div", { class: "v-exams-ad-top" },
        h("span", { class: "v-exams-ad-logo", "aria-hidden": "true" }, ad.business.charAt(0)),
        h("div", { class: "grow" },
          h("div", { class: "v-exams-ad-biz" }, ad.business),
          h("div", { class: "v-exams-ad-local" }, "Local partner")),
        h("span", { class: "v-exams-ad-label" }, "Sample ad")),
      h("p", { class: "v-exams-ad-text" }, ad.text),
      h("div", { class: "v-exams-ad-offer" }, ad.offer));
  }

  function renderExams(params, mount) {
    var state = SB.store.get(), now = SB.clock.now(), me = state.demo.currentUserId;
    var data = SB.rules.studyFor(state, now, me);
    var root = h("div", { class: "v-exams" });

    root.appendChild(h("h1", null, "Study sessions"));
    var f = takeFlash(); if (f) root.appendChild(f);

    suggestionCards(state, now, me).forEach(function (c) { root.appendChild(c); });

    var upcoming = data.sessions.filter(function (s) { return s.upcoming; });
    var past = data.sessions.filter(function (s) { return !s.upcoming; }).reverse();
    // Today: sessions on the same MT day that haven't ended, with their buttons right on the card.
    // The list redraws on every clock change, so buttons appear and disappear on their own.
    var todayKey = fmt(now, "day");
    var today = upcoming.filter(function (s) {
      return fmt(s.slot.start, "day") === todayKey && (s.seat.status === "placed" || s.seat.status === "confirmed" || s.seat.status === "attended");
    });
    var later = upcoming.filter(function (s) { return today.indexOf(s) < 0; });
    if (today.length) {
      root.appendChild(h("div", { class: "section-title" }, "Today"));
      root.appendChild(h("div", { class: "v-exams-sessions" }, today.map(function (s) { return todayCard(state, now, s); })));
    }
    if (later.length) {
      root.appendChild(h("div", { class: "section-title" }, today.length ? "Coming up" : "Your sessions"));
      root.appendChild(h("div", { class: "v-exams-sessions" }, later.map(function (s) { return sessionCard(state, now, s); })));
    }
    if (past.length) {
      var open = past.some(function (s) { return SB.rules.postOpen(state, now, s.seat.id); });
      root.appendChild(h("details", { class: "v-exams-past", open: open },
        h("summary", null, "Past sessions (" + past.length + ")"),
        h("div", { class: "v-exams-sessions" }, past.map(function (s) { return sessionCard(state, now, s); }))));
    }

    var addLink = h("a", { class: "btn btn-primary btn-block", href: "#/classes" }, "+ Add a class");
    if (data.noCourses) {
      root.appendChild(h("div", { class: "empty v-exams-noclass" },
        h("p", null, "Add your classes to see their study times."), addLink));
    } else {
      root.appendChild(h("div", { class: "row-between v-exams-pickhead" },
        h("div", { class: "section-title" }, "Pick study times"),
        h("a", { class: "btn-link small", href: "#/classes" }, "+ Add a class")));
      root.appendChild(h("p", { class: "muted small" },
        "Pick as many times as you like. If 3 or more people pick the same time, it becomes your study group " + state.settings.lockHoursBefore + " hours before it starts."));
      // D44: grouped by class; the next exam is shown only as context.
      data.classes.forEach(function (e) {
        root.appendChild(h("section", { class: "exam" },
          h("div", { class: "exam-head" },
            h("div", null,
              h("div", { class: "exam-name" }, shortName(e.course)),
              h("div", { class: "muted small" }, courseTitle(e.course))),
            e.nextExam ? h("div", { class: "exam-date", title: "Next exam" }, e.nextExam.name + " · " + fmt(e.nextExam.at, "day")) : null),
          e.slots.length
            ? h("div", { class: "slot-list" }, e.slots.map(function (s) { return slotRow(s); }))
            : SB.ui.empty("No open study times for this class yet.")));
      });
    }

    var ad = adCard(state, now); if (ad) root.appendChild(ad);

    mount.appendChild(root);
  }

  // ---------- #/session/:id ----------
  function renderSession(params, mount) {
    var state = SB.store.get(), now = SB.clock.now(), me = state.demo.currentUserId;
    var root = h("div", { class: "v-exams" });
    var back = h("a", { class: "btn-link v-exams-back", href: "#/exams" }, "‹ Study");
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

    var course = find(state.courses, slot.courseId);
    var actions = SB.rules.seatActions(state, now, seat.id);

    var f = takeFlash(); if (f) root.appendChild(f);

    // Details
    var spotKnown = session.spot && session.spot !== "To be announced";
    root.appendChild(h("div", { class: "card session-card v-exams-detail" },
      h("div", { class: "row-between" },
        h("div", { class: "muted small" }, course ? course.name : ""),
        statusTag(seat)),
      h("div", { class: "session-when" }, whenText(slot)),
      h("div", { class: "session-spot" }, slot.place),
      h("div", { class: "row row-wrap v-exams-tags" },
        h("span", { class: "tag tag-muted" }, "Table " + session.table),
        spotKnown ? h("span", { class: "tag tag-info" }, session.spot)
                  : h("span", { class: "tag tag-warn" }, "Spot: to be announced"),
        vibeTag(slot.vibe)),
      h("p", { class: "status-line" }, statusText(state, now, seat, slot, actions))));

    // Survey feedback: explain what "locked" means while the group is still ahead.
    if ((seat.status === "placed" || seat.status === "confirmed") && SB.clock.toMs(now) < SB.clock.toMs(slot.start)) {
      root.appendChild(h("div", { class: "notice notice-info v-exams-lockinfo" },
        h("strong", null, "This is your study group. "),
        "Enough classmates picked this time, so we booked a table and grouped you together. " +
        "Tap Still coming when we ask, then I'm here when you arrive."));
    }

    var cn = checkinNotice(state, seat); if (cn) root.appendChild(cn);

    // Actions, exactly as rules allow. I'm here lives in the check-in bar at the top (router.js).
    // D40: one-tap, blame-free backing out. "Can't make it" is the only way out shown;
    // it uses cantMakeIt inside the Still coming? window and cancel outside it (both no miss).
    var btns = [];
    if (actions.canConfirm) {
      btns.push(SB.ui.button("Still coming", function () { act(SB.store.confirm(seat.id), "Great, your group knows you're coming. See you there!"); }, { kind: "primary" }));
    }
    if (actions.canCantMakeIt || actions.canCancel) {
      btns.push(SB.ui.button("Can't make it", function () {
        act(actions.canCantMakeIt ? SB.store.cantMakeIt(seat.id) : SB.store.cancel(seat.id),
          "No problem, we'll let your group know. Thanks for the heads-up!");
      }, { kind: "secondary" }));
    }
    if (btns.length) root.appendChild(h("div", { class: "btn-group v-exams-actions" }, btns));

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
        ? SB.ui.button("Report a concern", function () { reportOpen = m.studentId; reportDraft = ""; SB.router.render(); },
            { kind: "secondary", class: "btn-small v-exams-reportbtn" })
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
        h("p", { class: "small muted" }, "For safety or conduct concerns, like harassment or feeling unsafe. " +
          "Not for attendance: you never need to tell us who didn't come. Reports are private; only the Prepd team sees them."),
        ta,
        h("div", { class: "btn-group mt" },
          SB.ui.button("Send report", function () {
            var text = reportDraft.trim();
            reportOpen = null; reportDraft = "";
            act(SB.store.report(session.id, m.studentId, text), "Report sent. The Prepd team will review it.");
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
