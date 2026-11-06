/* js/rules.js — pure rules. Every function deep-copies the state it is given and returns the copy.
   Nothing here reads SB.clock.now() or SB.store; "now" is always an argument.
   Uses SB.clock only for pure time math and formatting. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});

  // ---------- helpers ----------
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function ms(iso) { return SB.clock.toMs(iso); }
  function iso(m) { return SB.clock.fromMs(m); }
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function ok(state) { return { state: state }; }
  function fail(state, error) { return { state: state, error: error }; }
  function validIso(v) { return typeof v === "string" && !isNaN(Date.parse(v)); }

  function nextId(state, prefix) {
    state.seq = (state.seq || 0) + 1;
    return prefix + state.seq;
  }

  function slotOfSession(st, ses) { return ses ? find(st.slots, ses.slotId) : null; }
  function examOfSlot(st, slot) { return slot ? find(st.exams, slot.examId) : null; }
  function courseOfSlot(st, slot) { var e = examOfSlot(st, slot); return e ? find(st.courses, e.courseId) : null; }
  function courseIdOfSlotId(st, slotId) { var c = courseOfSlot(st, find(st.slots, slotId)); return c ? c.id : null; }
  function courseIdOfSeat(st, seat) {
    var ses = seat ? find(st.sessions, seat.sessionId) : null;
    return ses ? courseIdOfSlotId(st, ses.slotId) : null;
  }
  function seatContext(st, seatId) {
    var seat = find(st.seats, seatId); if (!seat) return null;
    var ses = find(st.sessions, seat.sessionId); if (!ses) return null;
    var slot = find(st.slots, ses.slotId); if (!slot) return null;
    return { seat: seat, session: ses, slot: slot };
  }
  function lockMs(st, slot) { return ms(slot.start) - st.settings.lockHoursBefore * 3600000; }
  function isAdmin(st, id) { return !!(id && find(st.admins, id)); }
  function student(st, id) { return id ? find(st.students, id) : null; }
  function finished(stu) {
    var o = stu && stu.onboarding;
    return !!(o && o.profile && o.conduct && o.intake && o.permissions);
  }
  function activePicks(st, slotId) {
    return st.picks.filter(function (p) { return p.slotId === slotId && p.status === "active"; });
  }
  function firstNames(st, ids) {
    return ids.map(function (id) { var s = student(st, id); return s && s.firstName ? s.firstName : "someone"; });
  }
  function examLabel(st, slot) {
    var e = examOfSlot(st, slot), c = courseOfSlot(st, slot);
    var short = c ? c.name.split(":")[0] : "";
    return (short ? short + " " : "") + (e ? e.name : "exam");
  }
  function notify(st, at, f) {
    st.notifications.push({
      id: nextId(st, "ntf_"), to: f.to, at: at, read: false, route: f.route || "#/exams", kind: f.kind,
      slotId: f.slotId || null, sessionId: f.sessionId || null, suggestedSlotId: f.suggestedSlotId || null,
      text: f.text
    });
  }
  function isValidCheckin(c) {
    return c.result === "in_range" || (c.result === "unverified" && c.adminDecision !== "rejected");
  }
  function hasValidCheckin(st, seatId) {
    return st.checkins.some(function (c) { return c.seatId === seatId && isValidCheckin(c); });
  }
  // D36: a tablemate named this seat's student in "Who did you study with?"
  function isAcknowledged(st, seat) {
    return st.postAnswers.some(function (a) {
      if ((a.studiedWith || []).indexOf(seat.studentId) < 0) return false;
      var by = find(st.seats, a.seatId);
      return !!(by && by.sessionId === seat.sessionId);
    });
  }
  // D36: attending = a valid check-in or being named by a tablemate
  function hasAttendance(st, seat) { return hasValidCheckin(st, seat.id) || isAcknowledged(st, seat); }

  // ---------- misses (D36–D39) ----------
  // D37: a miss stops counting when the next exam in the same class opens its study window
  // (that exam's time minus slotWindowDays).
  function missResetMs(st, miss) {
    var exam = find(st.exams, miss.examId); if (!exam) return -Infinity;
    var next = Infinity;
    st.exams.forEach(function (e) {
      if (e.courseId !== exam.courseId || ms(e.at) <= ms(exam.at)) return;
      next = Math.min(next, ms(e.at) - st.settings.slotWindowDays * 86400000);
    });
    return next;
  }
  function isRecentMiss(state, now, missId) {
    var k = find(state.misses, missId);
    return !!(k && !k.removed && ms(now) < missResetMs(state, k));
  }
  function recentMisses(state, now, studentId, courseId) {
    return state.misses.filter(function (k) {
      if (k.studentId !== studentId) return false;
      var exam = find(state.exams, k.examId);
      return !!(exam && exam.courseId === courseId && isRecentMiss(state, now, k.id));
    }).length;
  }
  // D38: the student's own track record, counting only promises to a group (confirmed seats).
  function reliability(state, studentId) {
    var shownUp = 0, promised = 0;
    state.seats.forEach(function (seat) {
      if (seat.studentId !== studentId) return;
      if (seat.status === "attended") { shownUp++; promised++; }
      if (seat.status === "no_show" &&
          !state.misses.some(function (k) { return k.seatId === seat.id && k.removed; })) promised++;
    });
    return { shownUp: shownUp, promised: promised };
  }

  // Mutates st (a copy). Records a miss at `at` and sends the private, gentle notice (D38).
  function giveMiss(st, seat, at) {
    var slot = slotOfSession(st, find(st.sessions, seat.sessionId));
    var exam = examOfSlot(st, slot), course = courseOfSlot(st, slot);
    st.misses.push({ id: nextId(st, "mis_"), studentId: seat.studentId, seatId: seat.id, examId: exam ? exam.id : null,
      at: at, removed: false });
    var cls = course ? course.name.split(":")[0] : "class";
    var n = course ? recentMisses(st, at, seat.studentId, course.id) : 0;
    var text = "Looks like you missed your " + cls + " session. Life happens! Next time, tapping “Can't make it” lets your group know.";
    if (n >= st.settings.earlyConfirmAfterMisses) {
      text = "Looks like you missed another " + cls + " session. For your next " + cls + " sessions this exam, please confirm by " +
        st.settings.earlyConfirmByHoursBefore + " hours before the start, so your group can count on a full table. " +
        "This resets when your next " + cls + " exam's study times open.";
    }
    notify(st, at, { to: seat.studentId, kind: "miss_notice", route: "#/me", text: text });
  }

  // ---------- drop suggestion (D4, D21) ----------
  function suggestionFor(st, slot, studentId) {
    var best = null, bestCount = -1;
    st.slots.forEach(function (s) {
      if (s.id === slot.id || s.examId !== slot.examId || s.status !== "open") return;
      var picks = activePicks(st, s.id);
      if (picks.some(function (p) { return p.studentId === studentId; })) return;
      var n = picks.length;
      if (n > bestCount ||
          (n === bestCount && (ms(s.start) < ms(best.start) || (ms(s.start) === ms(best.start) && s.id < best.id)))) {
        best = s; bestCount = n;
      }
    });
    return best;
  }

  // ---------- timeline jobs ----------
  var ORDER = { final: 0, end: 1, start: 2, confirm: 3, earlyRelease: 4, lowTurnout: 5, earlyAsk: 6, lock: 7, pilotEnd: 8 };

  function dueJobs(st, toMs) {
    var jobs = [];
    st.slots.forEach(function (slot) {
      if (slot.status === "open" && !slot.jobs.lockDone) {
        var t = lockMs(st, slot);
        if (t <= toMs) jobs.push({ type: "lock", t: t, slot: slot, id: slot.id });
      }
    });
    st.sessions.forEach(function (ses) {
      var slot = find(st.slots, ses.slotId); if (!slot) return;
      var T = ms(slot.start), E = ms(slot.end), s = st.settings;
      var list = [
        ["earlyAsk", T - s.earlyConfirmAskHoursBefore * 3600000, "earlyAskSent"],
        ["lowTurnout", T - s.lowTurnoutHoursBefore * 3600000, "lowTurnoutSent"],
        ["earlyRelease", T - s.earlyConfirmByHoursBefore * 3600000, "earlyReleaseDone"],
        ["confirm", T - s.confirmMinutesBefore * 60000, "confirmSent"],
        ["start", T, "startDone"],
        ["end", E, "endDone"],
        ["final", E + s.postWindowHours * 3600000, "finalDone"]
      ];
      list.forEach(function (j) {
        if (!ses.jobs[j[2]] && j[1] <= toMs) jobs.push({ type: j[0], t: j[1], slot: slot, session: ses, id: ses.id });
      });
    });
    if (!st.jobs.surveyOpenSent && st.settings.pilotEnd && ms(st.settings.pilotEnd) <= toMs) {
      jobs.push({ type: "pilotEnd", t: ms(st.settings.pilotEnd), id: "" });
    }
    jobs.sort(function (a, b) {
      if (a.t !== b.t) return a.t - b.t;
      if (ORDER[a.type] !== ORDER[b.type]) return ORDER[a.type] - ORDER[b.type];
      var as = a.slot ? ms(a.slot.start) : 0, bs = b.slot ? ms(b.slot.start) : 0;
      if (as !== bs) return as - bs;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return jobs;
  }

  function runLock(st, slot, at) {
    slot.jobs.lockDone = true;
    var s = st.settings;
    var picks = activePicks(st, slot.id).sort(function (a, b) {
      var d = ms(a.at) - ms(b.at); if (d) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var n = picks.length;
    var when = SB.clock.fmt(slot.start, "dayTime");
    if (n >= s.minGroup) {
      slot.status = "locked";
      var k = Math.ceil(n / s.maxPerTable), base = Math.floor(n / k), extra = n % k, idx = 0, missing = 0;
      var tables = [];
      for (var t = 1; t <= k; t++) {
        var size = base + (t <= extra ? 1 : 0);
        var spot = slot.spots[t - 1];
        if (!spot) { spot = "To be announced"; missing++; }
        var ses = { id: nextId(st, "ses_"), slotId: slot.id, table: t, spot: spot,
          jobs: { earlyAskSent: false, lowTurnoutSent: false, earlyReleaseDone: false, confirmSent: false,
            startDone: false, endDone: false, finalDone: false } };
        st.sessions.push(ses);
        var members = picks.slice(idx, idx + size); idx += size;
        var courseId = courseIdOfSlotId(st, slot.id);
        members.forEach(function (p) {
          p.status = "placed";
          st.seats.push({ id: nextId(st, "set_"), sessionId: ses.id, studentId: p.studentId, status: "placed",
            confirmedAt: null, cancelledAt: null, cancelReason: null,
            earlyConfirm: recentMisses(st, at, p.studentId, courseId) >= s.earlyConfirmAfterMisses }); // D39, fixed at lock
        });
        tables.push({ ses: ses, ids: members.map(function (p) { return p.studentId; }) });
      }
      tables.forEach(function (tb) {
        tb.ids.forEach(function (sid) {
          var mates = firstNames(st, tb.ids.filter(function (x) { return x !== sid; }));
          var mine = st.seats.filter(function (x) { return x.sessionId === tb.ses.id && x.studentId === sid; })[0];
          var early = mine && mine.earlyConfirm
            ? " Please tap Still coming by " + SB.clock.fmt(SB.clock.add(slot.start, { hours: -s.earlyConfirmByHoursBefore }), "dayTime") +
              " to keep your seat." : "";
          notify(st, at, { to: sid, kind: "session_confirmed", route: "#/session/" + tb.ses.id,
            slotId: slot.id, sessionId: tb.ses.id,
            text: "Session confirmed: " + when + " at " + slot.place + ", " + tb.ses.spot + " (table " + tb.ses.table +
              "). Your table: " + (mates.length ? mates.join(", ") : "just you so far") + "." + early });
        });
      });
      if (missing) {
        notify(st, at, { to: "admin", kind: "out_of_spots", route: "#/admin/slot/" + slot.id, slotId: slot.id,
          text: "Out of spots: " + examLabel(st, slot) + " slot on " + when + " at " + slot.place + " formed " + k +
            " tables but only " + slot.spots.length + " spots are booked. " + missing +
            " table(s) show \"To be announced\"." });
      }
    } else {
      slot.status = "dropped";
      picks.forEach(function (p) { p.status = "not_placed"; });
      picks.forEach(function (p) {
        var sug = suggestionFor(st, slot, p.studentId);
        var text = "Your " + when + " slot for " + examLabel(st, slot) + " was dropped: fewer than " + s.minGroup +
          " people picked it.";
        if (sug) {
          text += " Try " + SB.clock.fmt(sug.start, "dayTime") + " at " + sug.place + " instead (" +
            activePicks(st, sug.id).length + " going).";
        }
        notify(st, at, { to: p.studentId, kind: "slot_dropped", route: "#/exams", slotId: slot.id,
          suggestedSlotId: sug ? sug.id : null, text: text });
      });
    }
  }

  var POST_TEXT = "How did it go? Tell us who you studied with and whether the session left you more prepared.";

  function sessionSeats(st, sesId) { return st.seats.filter(function (x) { return x.sessionId === sesId; }); }

  function runJob(st, job) {
    var at = iso(job.t);
    var ses = job.session, slot = job.slot;
    switch (job.type) {
      case "lock": runLock(st, slot, at); break;
      case "earlyAsk": // D39: seats that must confirm early are asked a day ahead
        ses.jobs.earlyAskSent = true;
        sessionSeats(st, ses.id).forEach(function (x) {
          if (x.status !== "placed" || !x.earlyConfirm) return;
          notify(st, at, { to: x.studentId, kind: "still_coming", route: "#/session/" + ses.id, slotId: slot.id,
            sessionId: ses.id,
            text: "Still coming? Your group is counting on you for " + SB.clock.fmt(slot.start, "dayTime") + " at " + slot.place +
              ". Please answer by " + SB.clock.fmt(SB.clock.add(slot.start, { hours: -st.settings.earlyConfirmByHoursBefore }), "time") + "." });
        });
        break;
      case "earlyRelease": // D39: no answer by the early deadline frees the seat, with no miss
        ses.jobs.earlyReleaseDone = true;
        sessionSeats(st, ses.id).forEach(function (x) { if (x.status === "placed" && x.earlyConfirm) x.status = "released"; });
        break;
      case "lowTurnout":
        ses.jobs.lowTurnoutSent = true;
        var still = sessionSeats(st, ses.id).filter(function (x) { return x.status === "placed" || x.status === "confirmed"; });
        if (still.length < st.settings.minGroup) {
          notify(st, at, { to: "admin", kind: "low_turnout", route: "#/admin/slot/" + slot.id, slotId: slot.id,
            sessionId: ses.id,
            text: "Low turnout: " + examLabel(st, slot) + " session on " + SB.clock.fmt(slot.start, "dayTime") +
              " (table " + ses.table + ") has only " + still.length + " student" + (still.length === 1 ? "" : "s") +
              " still placed." });
        }
        break;
      case "confirm":
        ses.jobs.confirmSent = true;
        sessionSeats(st, ses.id).forEach(function (x) {
          if (x.status !== "placed") return;
          notify(st, at, { to: x.studentId, kind: "still_coming", route: "#/session/" + ses.id, slotId: slot.id,
            sessionId: ses.id,
            text: "Still coming? Your study session starts at " + SB.clock.fmt(slot.start, "time") + " at " +
              slot.place + ", " + ses.spot + "." });
        });
        break;
      case "start":
        ses.jobs.startDone = true;
        sessionSeats(st, ses.id).forEach(function (x) { if (x.status === "placed") x.status = "released"; });
        break;
      case "end":
        ses.jobs.endDone = true;
        sessionSeats(st, ses.id).forEach(function (x) {
          if (x.status !== "attended") return;
          notify(st, at, { to: x.studentId, kind: "post_session", route: "#/after/" + ses.id, slotId: slot.id,
            sessionId: ses.id, text: POST_TEXT });
        });
        break;
      case "final": // D36: after the 24h window, a confirmed seat nobody saw is a miss
        ses.jobs.finalDone = true;
        sessionSeats(st, ses.id).forEach(function (x) {
          if (x.status === "confirmed" && !hasAttendance(st, x)) {
            x.status = "no_show";
            giveMiss(st, x, at);
          }
        });
        break;
      case "pilotEnd":
        st.jobs.surveyOpenSent = true;
        st.students.forEach(function (s) {
          if (!finished(s)) return;
          notify(st, at, { to: s.id, kind: "survey_open", route: "#/survey/exit",
            text: "The pilot is wrapping up. Tell us how it went: a short exit survey (2 minutes)." });
        });
        break;
    }
  }

  // Applies every due job up to `now` (a job whose flag is false and whose time is <= now), in time order.
  function tick(state, now) {
    var st = copy(state);
    var toMs = ms(now);
    var guard = 0;
    for (;;) {
      var jobs = dueJobs(st, toMs);
      if (!jobs.length) break;
      runJob(st, jobs[0]); // re-collect after each job: a lock creates sessions with their own jobs
      if (++guard > 100000) throw new Error("tick: too many jobs");
    }
    if (toMs >= ms(st.demo.now)) st.demo.now = now;
    return st;
  }

  // ---------- reads ----------
  function slotCount(state, slotId) {
    return state.picks.filter(function (p) { return p.slotId === slotId && (p.status === "active" || p.status === "placed"); }).length;
  }

  function canPick(state, now, studentId, slotId) {
    var s = student(state, studentId), slot = find(state.slots, slotId);
    if (!s || !slot || !finished(s)) return false;
    if (slot.status !== "open" || slot.jobs.lockDone || ms(now) >= lockMs(state, slot)) return false;
    var c = courseOfSlot(state, slot);
    if (!c || s.courseIds.indexOf(c.id) < 0) return false;
    return !activePicks(state, slotId).some(function (p) { return p.studentId === studentId; });
  }

  function seatActions(state, now, seatId) {
    var r = { canConfirm: false, canCantMakeIt: false, canCancel: false, canCheckIn: false, canReport: false };
    var cx = seatContext(state, seatId); if (!cx) return r;
    var n = ms(now), T = ms(cx.slot.start), E = ms(cx.slot.end), s = state.settings, st = cx.seat.status;
    var live = st === "placed" || st === "confirmed";
    // D19; D39: an early-confirm seat answers from lock until T − earlyConfirmByHoursBefore
    r.canConfirm = r.canCantMakeIt = st === "placed" && (cx.seat.earlyConfirm
      ? n < T - s.earlyConfirmByHoursBefore * 3600000
      : n >= T - s.confirmMinutesBefore * 60000 && n < T);
    r.canCancel = live && n < T;
    r.canCheckIn = live && n >= T - s.checkInOpensMinutesBefore * 60000 && n < E;
    r.canReport = n < E + s.postWindowHours * 3600000 &&
      state.seats.some(function (x) { return x.sessionId === cx.session.id && x.id !== seatId; });
    return r;
  }

  function tablemates(state, now, seatId) {
    var seat = find(state.seats, seatId); if (!seat) return [];
    return state.seats.filter(function (x) { return x.sessionId === seat.sessionId && x.id !== seat.id; })
      .map(function (x) {
        var s = student(state, x.studentId);
        return s ? { studentId: s.id, firstName: s.firstName, year: s.year } : null;
      })
      .filter(Boolean);
  }

  function postOpen(state, now, seatId) {
    var cx = seatContext(state, seatId); if (!cx) return false;
    var n = ms(now), E = ms(cx.slot.end);
    return cx.seat.status === "attended" && n >= E && n < E + state.settings.postWindowHours * 3600000;
  }

  function surveyOpen(state, now) {
    return !!(state.settings.pilotEnd && ms(now) >= ms(state.settings.pilotEnd));
  }

  function slotWarnings(state, slot) {
    var w = [];
    var exam = slot && find(state.exams, slot.examId);
    if (!exam || !validIso(slot.start) || !validIso(slot.end)) return w;
    var days = state.settings.slotWindowDays;
    var from = ms(SB.clock.add(exam.at, { days: -days })), examMs = ms(exam.at);
    if (ms(slot.start) < from || ms(slot.end) > examMs) {
      w.push("This slot isn't in the " + days + " days before the exam (" + SB.clock.fmt(exam.at, "dayTime") + ").");
    }
    return w;
  }

  function examsFor(state, now, studentId) {
    var s = student(state, studentId);
    var out = { sessions: [], exams: [], noCourses: true };
    if (!s) return out;
    out.noCourses = s.courseIds.length === 0;
    var n = ms(now);
    state.seats.forEach(function (seat) {
      if (seat.studentId !== studentId) return;
      var cx = seatContext(state, seat.id); if (!cx) return;
      out.sessions.push({ seat: seat, session: cx.session, slot: cx.slot, exam: examOfSlot(state, cx.slot),
        course: courseOfSlot(state, cx.slot), upcoming: n < ms(cx.slot.end) });
    });
    out.sessions.sort(function (a, b) {
      return ms(a.slot.start) - ms(b.slot.start) || (a.session.id < b.session.id ? -1 : 1);
    });
    var exams = state.exams.filter(function (e) { return s.courseIds.indexOf(e.courseId) >= 0 && n < ms(e.at); })
      .sort(function (a, b) { return ms(a.at) - ms(b.at) || (a.id < b.id ? -1 : 1); });
    exams.forEach(function (e) {
      var slots = state.slots.filter(function (sl) { return sl.examId === e.id && sl.status === "open"; })
        .sort(function (a, b) {
          var pa = a.vibe === s.vibe ? 0 : 1, pb = b.vibe === s.vibe ? 0 : 1;
          return pa - pb || ms(a.start) - ms(b.start) || (a.id < b.id ? -1 : 1);
        })
        .map(function (sl) {
          return { slot: sl, count: slotCount(state, sl.id), preferred: sl.vibe === s.vibe,
            picked: activePicks(state, sl.id).some(function (p) { return p.studentId === studentId; }),
            canPick: canPick(state, now, studentId, sl.id) };
        });
      out.exams.push({ exam: e, course: find(state.courses, e.courseId), slots: slots });
    });
    return out;
  }

  // ---------- metrics ----------
  function ratio(num, den, scale) { return { num: num, den: den, value: den === 0 ? null : (num / den) * (scale || 1) }; }

  function computeMetrics(st, courseId) {
    var inCourse = function (cid) { return courseId === null || cid === courseId; };
    var courses = st.courses.filter(function (c) { return inCourse(c.id); });
    var studentsIn = st.students.filter(function (s) {
      return courseId === null ? true : s.courseIds.indexOf(courseId) >= 0;
    });

    // Sign-up conversion
    var suNum = 0, suDen = 0;
    courses.forEach(function (c) {
      suDen += c.enrolled || 0;
      suNum += st.students.filter(function (s) { return s.courseIds.indexOf(c.id) >= 0 && finished(s); }).length;
    });

    // Match rate (D24: removed picks never count)
    var matched = {}, decided = {};
    st.picks.forEach(function (p) {
      if (p.status !== "placed" && p.status !== "not_placed") return;
      if (!inCourse(courseIdOfSlotId(st, p.slotId))) return;
      decided[p.studentId] = true;
      if (p.status === "placed") matched[p.studentId] = true;
    });

    // Show-up and no-show
    var nowMs = ms(st.demo.now);
    var suConf = 0, suValid = 0, evConf = 0, noShow = 0;
    st.seats.forEach(function (seat) {
      var cx = seatContext(st, seat.id); if (!cx) return;
      if (!inCourse(courseIdOfSlotId(st, cx.slot.id))) return;
      var T = ms(cx.slot.start);
      if (seat.confirmedAt) evConf++;
      if (seat.status === "no_show") noShow++;
      var cancelledBeforeStart = seat.status === "cancelled" && seat.cancelledAt && ms(seat.cancelledAt) < T;
      if (seat.confirmedAt && !cancelledBeforeStart && T <= nowMs) {
        suConf++;
        if (hasAttendance(st, seat)) suValid++; // D36
      }
    });

    // Better prepared
    var more = 0, posts = 0;
    st.postAnswers.forEach(function (a) {
      var seat = find(st.seats, a.seatId); if (!seat) return;
      if (!inCourse(courseIdOfSeat(st, seat))) return;
      posts++; if (a.answer === "more") more++;
    });

    // Connection and NPS (survey answers count once for every course the student joined)
    var inQ = (st.surveys.intake || []).filter(function (q) { return q.isConnection; })[0];
    var exQ = (st.surveys.exit || []).filter(function (q) { return q.isConnection; })[0];
    var both = 0, yesIn = 0, yesEx = 0, npsN = 0, prom = 0, det = 0;
    studentsIn.forEach(function (s) {
      var ia = null, ea = null;
      st.surveyAnswers.forEach(function (a) {
        if (a.studentId !== s.id) return;
        if (a.kind === "intake") ia = a; else if (a.kind === "exit") ea = a;
      });
      if (ia && ea && inQ && exQ && ia.answers[inQ.id] !== undefined && ea.answers[exQ.id] !== undefined) {
        both++;
        if (ia.answers[inQ.id] === "yes") yesIn++;
        if (ea.answers[exQ.id] === "yes") yesEx++;
      }
      if (ea && typeof ea.nps === "number") {
        npsN++;
        if (ea.nps >= 9) prom++; else if (ea.nps <= 6) det++;
      }
    });

    var r = {
      matchRate: ratio(Object.keys(matched).length, Object.keys(decided).length),
      showUpRate: ratio(suValid, suConf),
      repeatUse: null, // Still open #7
      betterPrepared: ratio(more, posts),
      connection: ratio(yesEx - yesIn, both),
      noShowRate: ratio(noShow, evConf),
      nps: ratio(prom - det, npsN, 100)
    };
    r.signupConversion = ratio(suNum, suDen);
    return r;
  }

  function metrics(state) {
    var st = copy(state);
    var out = { overall: computeMetrics(st, null), byCourse: {} };
    st.courses.forEach(function (c) { out.byCourse[c.id] = computeMetrics(st, c.id); });
    return out;
  }

  // ---------- transitions: (state, now, userId, ...args) -> { state, error? } ----------
  var EMAIL_RE = /^[^@\s]+@byu\.edu$/;
  function normEmail(e) { return typeof e === "string" ? e.trim().toLowerCase() : ""; }

  function needStudent(st, userId) {
    var s = student(st, userId);
    return s ? null : "Sign in as a student first.";
  }
  function needAdmin(st, userId) { return isAdmin(st, userId) ? null : "Only admins can do that."; }
  function ownSeat(st, userId, seatId) {
    var seat = find(st.seats, seatId);
    return seat && seat.studentId === userId ? seat : null;
  }

  function addCourseToStudent(st, s, code) {
    var c = st.courses.filter(function (x) { return x.linkCode === code; })[0];
    if (c && s.courseIds.indexOf(c.id) < 0) s.courseIds.push(c.id);
  }

  function setLocation(state, now, userId, v) {
    var st = copy(state);
    if (["in_range", "out_of_range", "denied"].indexOf(v) < 0) return fail(st, "Unknown location setting.");
    st.demo.location = v; return ok(st);
  }
  function switchUser(state, now, userId, id) {
    var st = copy(state);
    if (id !== null && !student(st, id) && !isAdmin(st, id)) return fail(st, "No such user.");
    st.demo.currentUserId = id; return ok(st);
  }
  function setPendingLink(state, now, userId, code) {
    var st = copy(state);
    if (code !== null && !st.courses.some(function (c) { return c.linkCode === code; })) return fail(st, "This link isn't valid.");
    st.demo.pendingLinkCode = code; return ok(st);
  }
  function requestLink(state, now, userId, email) {
    var st = copy(state);
    if (!EMAIL_RE.test(normEmail(email))) return fail(st, "Use your @byu.edu email address.");
    return ok(st);
  }
  function openLink(state, now, userId, email) {
    var st = copy(state);
    var e = normEmail(email);
    if (!EMAIL_RE.test(e)) return fail(st, "Use your @byu.edu email address.");
    var adm = st.admins.filter(function (a) { return normEmail(a.email) === e; })[0];
    if (adm) { st.demo.currentUserId = adm.id; return ok(st); }
    var s = st.students.filter(function (x) { return normEmail(x.email) === e; })[0];
    if (!s) {
      s = { id: nextId(st, "stu_"), email: e, firstName: null, year: null, vibe: null, courseIds: [],
        onboarding: { profile: false, conduct: false, intake: false, permissions: false } };
      st.students.push(s);
    }
    if (st.demo.pendingLinkCode) { addCourseToStudent(st, s, st.demo.pendingLinkCode); st.demo.pendingLinkCode = null; }
    st.demo.currentUserId = s.id;
    return ok(st);
  }
  function joinCourse(state, now, userId, linkCode) {
    var st = copy(state);
    var c = st.courses.filter(function (x) { return x.linkCode === linkCode; })[0];
    if (!c) return fail(st, "This link isn't valid.");
    if (!userId) { st.demo.pendingLinkCode = linkCode; return ok(st); }
    if (isAdmin(st, userId)) return fail(st, "Admins don't join courses.");
    var s = student(st, userId); if (!s) return fail(st, "Sign in as a student first.");
    addCourseToStudent(st, s, linkCode);
    st.demo.pendingLinkCode = null;
    return ok(st);
  }
  // D35: a signed-in student can add any course from the list, without its link.
  function addCourse(state, now, userId, courseId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var c = st.courses.filter(function (x) { return x.id === courseId; })[0];
    if (!c) return fail(st, "That class isn't in the list.");
    var s = student(st, userId);
    if (s.courseIds.indexOf(c.id) >= 0) return fail(st, "You already added this class.");
    addCourseToStudent(st, s, c.linkCode);
    return ok(st);
  }
  function signOut(state, now, userId) {
    var st = copy(state); st.demo.currentUserId = null; return ok(st);
  }

  var YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];
  function saveProfile(state, now, userId, p) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    p = p || {};
    var name = typeof p.firstName === "string" ? p.firstName.trim() : "";
    if (!name) return fail(st, "Enter your first name.");
    if (YEARS.indexOf(p.year) < 0) return fail(st, "Pick your year.");
    if (p.vibe !== "quiet" && p.vibe !== "chatty") return fail(st, "Pick quiet or chatty.");
    var s = student(st, userId);
    s.firstName = name; s.year = p.year; s.vibe = p.vibe; s.onboarding.profile = true;
    return ok(st);
  }
  function acceptConduct(state, now, userId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var s = student(st, userId);
    if (!s.onboarding.profile) return fail(st, "Finish your profile first.");
    s.onboarding.conduct = true; return ok(st);
  }

  // Validates answers for a survey. Returns { answers } or { error }.
  function cleanAnswers(questions, answers) {
    answers = answers || {};
    var out = {};
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i], v = answers[q.id];
      if (q.type === "text") { out[q.id] = typeof v === "string" ? v : ""; continue; }
      if (v === undefined || v === null || v === "") return { error: "Answer every question: \"" + q.text + "\"" };
      if (q.type === "yesno" && v !== "yes" && v !== "no") return { error: "Answer yes or no: \"" + q.text + "\"" };
      if (q.type === "scale5") {
        v = Number(v);
        if (!(v >= 1 && v <= 5 && Math.floor(v) === v)) return { error: "Pick 1 to 5: \"" + q.text + "\"" };
      }
      if (q.type === "choice" && (q.options || []).indexOf(v) < 0) return { error: "Pick an option: \"" + q.text + "\"" };
      out[q.id] = v;
    }
    return { answers: out };
  }

  function submitIntake(state, now, userId, answers) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var s = student(st, userId);
    if (!s.onboarding.conduct) return fail(st, "Accept the code of conduct first.");
    var c = cleanAnswers(st.surveys.intake, answers); if (c.error) return fail(st, c.error);
    st.surveyAnswers = st.surveyAnswers.filter(function (a) { return !(a.studentId === userId && a.kind === "intake"); });
    st.surveyAnswers.push({ studentId: userId, kind: "intake", answers: c.answers, nps: null, at: now });
    s.onboarding.intake = true;
    return ok(st);
  }
  function finishPermissions(state, now, userId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var s = student(st, userId);
    if (!s.onboarding.intake) return fail(st, "Finish the intake survey first.");
    s.onboarding.permissions = true; return ok(st); // D28: the answers change nothing
  }

  function pick(state, now, userId, slotId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    if (!canPick(st, now, userId, slotId)) {
      var slot = find(st.slots, slotId);
      if (!slot) return fail(st, "That slot doesn't exist.");
      if (slot.status !== "open" || ms(now) >= lockMs(st, slot)) return fail(st, "Picking for this slot has closed.");
      return fail(st, "You can't pick this slot.");
    }
    st.picks.push({ id: nextId(st, "pck_"), slotId: slotId, studentId: userId, at: now, status: "active", removedReason: null });
    return ok(st);
  }
  function unpick(state, now, userId, slotId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var slot = find(st.slots, slotId);
    if (!slot) return fail(st, "That slot doesn't exist.");
    if (slot.status !== "open" || slot.jobs.lockDone || ms(now) >= lockMs(st, slot)) return fail(st, "Picking for this slot has closed.");
    var p = activePicks(st, slotId).filter(function (x) { return x.studentId === userId; })[0];
    if (!p) return fail(st, "You haven't picked this slot.");
    p.status = "removed"; p.removedReason = "student";
    return ok(st);
  }

  function seatOp(state, now, userId, seatId, flag, apply) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var seat = ownSeat(st, userId, seatId); if (!seat) return fail(st, "That isn't your session.");
    if (!seatActions(st, now, seatId)[flag]) return fail(st, "That isn't available right now.");
    apply(st, seat);
    return ok(st);
  }
  function confirm(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canConfirm", function (st, seat) {
      seat.status = "confirmed"; seat.confirmedAt = now;
    });
  }
  // D40: backing out tells the rest of the table (first name only), never with blame.
  function tellGroup(st, seat, now) {
    var ses = find(st.sessions, seat.sessionId), slot = slotOfSession(st, ses);
    var name = firstNames(st, [seat.studentId])[0];
    sessionSeats(st, seat.sessionId).forEach(function (x) {
      if (x.id === seat.id || (x.status !== "placed" && x.status !== "confirmed")) return;
      notify(st, now, { to: x.studentId, kind: "mate_cancelled", route: "#/session/" + ses.id, slotId: slot.id,
        sessionId: ses.id,
        text: name + " can't make it to your " + SB.clock.fmt(slot.start, "dayTime") + " session. The rest of your table is still on!" });
    });
  }
  function cantMakeIt(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canCantMakeIt", function (st, seat) {
      seat.status = "cancelled"; seat.cancelledAt = now; seat.cancelReason = "cant_make_it";
      tellGroup(st, seat, now);
    });
  }
  function cancel(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canCancel", function (st, seat) {
      seat.status = "cancelled"; seat.cancelledAt = now; seat.cancelReason = "student";
      tellGroup(st, seat, now);
    });
  }
  function checkIn(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canCheckIn", function (st, seat) {
      var loc = st.demo.location;
      var result = loc === "in_range" ? "in_range" : loc === "denied" ? "unverified" : "out_of_range";
      st.checkins.push({ id: nextId(st, "chk_"), seatId: seat.id, at: now, result: result, adminDecision: null });
      if (result !== "out_of_range") {
        if (seat.status === "placed") seat.confirmedAt = now; // D18
        seat.status = "attended";
      }
    });
  }
  function report(state, now, userId, sessionId, aboutStudentId, text) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var mine = st.seats.filter(function (x) { return x.sessionId === sessionId && x.studentId === userId; })[0];
    if (!mine) return fail(st, "That isn't your session.");
    if (aboutStudentId === userId || !st.seats.some(function (x) { return x.sessionId === sessionId && x.studentId === aboutStudentId; })) {
      return fail(st, "You can only report someone at your table.");
    }
    if (!seatActions(st, now, mine.id).canReport) return fail(st, "Reporting for this session has closed.");
    st.reports.push({ id: nextId(st, "rpt_"), sessionId: sessionId, byStudentId: userId, aboutStudentId: aboutStudentId,
      text: typeof text === "string" ? text : "", at: now, adminDecision: null });
    return ok(st);
  }
  // D36: studiedWith names tablemates (student IDs). Each named student whose seat is still
  // `confirmed` (no check-in yet) becomes `attended` and gets the post-session question too.
  function answerPost(state, now, userId, seatId, answer, studiedWith) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var mine = ownSeat(st, userId, seatId); if (!mine) return fail(st, "That isn't your session.");
    if (["more", "same", "less"].indexOf(answer) < 0) return fail(st, "Pick one answer.");
    if (!postOpen(st, now, seatId)) return fail(st, "This question isn't open.");
    if (st.postAnswers.some(function (a) { return a.seatId === seatId; })) return fail(st, "You already answered.");
    var names = studiedWith || [];
    if (!Array.isArray(names)) return fail(st, "Pick tablemates from your table.");
    var seatsFor = {};
    sessionSeats(st, mine.sessionId).forEach(function (x) { if (x.studentId !== userId) seatsFor[x.studentId] = x; });
    var clean = [];
    for (var i = 0; i < names.length; i++) {
      if (!seatsFor[names[i]]) return fail(st, "You can only name people at your table.");
      if (clean.indexOf(names[i]) < 0) clean.push(names[i]);
    }
    st.postAnswers.push({ seatId: seatId, answer: answer, studiedWith: clean, at: now });
    var ses = find(st.sessions, mine.sessionId), slot = slotOfSession(st, ses);
    clean.forEach(function (sid) {
      var x = seatsFor[sid];
      if (x.status !== "confirmed") return;
      x.status = "attended";
      notify(st, now, { to: x.studentId, kind: "post_session", route: "#/after/" + ses.id, slotId: slot.id,
        sessionId: ses.id, text: POST_TEXT });
    });
    return ok(st);
  }
  function submitExit(state, now, userId, answers, nps) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    if (!finished(student(st, userId))) return fail(st, "Finish sign-up first.");
    if (!surveyOpen(st, now)) return fail(st, "The exit survey isn't open yet.");
    if (st.surveyAnswers.some(function (a) { return a.studentId === userId && a.kind === "exit"; })) {
      return fail(st, "You already answered the exit survey.");
    }
    var c = cleanAnswers(st.surveys.exit, answers); if (c.error) return fail(st, c.error);
    var n = Number(nps);
    if (nps === null || nps === undefined || nps === "" || !(n >= 0 && n <= 10 && Math.floor(n) === n)) {
      return fail(st, "Pick a score from 0 to 10.");
    }
    st.surveyAnswers.push({ studentId: userId, kind: "exit", answers: c.answers, nps: n, at: now });
    return ok(st);
  }
  function deleteAccount(state, now, userId) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    var seatIds = {};
    st.seats.forEach(function (x) { if (x.studentId === userId) seatIds[x.id] = true; });
    st.students = st.students.filter(function (s) { return s.id !== userId; });
    st.picks = st.picks.filter(function (p) { return p.studentId !== userId; });
    st.seats = st.seats.filter(function (x) { return !seatIds[x.id]; });
    st.misses = st.misses.filter(function (k) { return k.studentId !== userId && !seatIds[k.seatId]; });
    st.checkins = st.checkins.filter(function (c) { return !seatIds[c.seatId]; });
    st.postAnswers = st.postAnswers.filter(function (a) { return !seatIds[a.seatId]; });
    st.postAnswers.forEach(function (a) {
      if (a.studiedWith) a.studiedWith = a.studiedWith.filter(function (id) { return id !== userId; });
    });
    st.reports = st.reports.filter(function (r) { return r.byStudentId !== userId && r.aboutStudentId !== userId; });
    st.surveyAnswers = st.surveyAnswers.filter(function (a) { return a.studentId !== userId; });
    st.notifications = st.notifications.filter(function (n) { return n.to !== userId; });
    st.demo.currentUserId = null;
    return ok(st);
  }
  function markRead(state, now, userId, notificationId) {
    var st = copy(state);
    var n = find(st.notifications, notificationId);
    if (!n) return fail(st, "No such notification.");
    var mine = n.to === userId || (n.to === "admin" && isAdmin(st, userId));
    if (!mine) return fail(st, "That notification isn't yours.");
    n.read = true; return ok(st);
  }

  // ---------- admin ----------
  function saveCourse(state, now, userId, course) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    course = course || {};
    var name = (course.name || "").trim(), section = String(course.section == null ? "" : course.section).trim();
    var code = (course.linkCode || "").trim(), enrolled = Number(course.enrolled);
    if (!name) return fail(st, "Enter a course name.");
    if (!code) return fail(st, "Enter a link code.");
    if (!(enrolled >= 0 && Math.floor(enrolled) === enrolled)) return fail(st, "Enrollment must be a whole number.");
    if (st.courses.some(function (c) { return c.linkCode === code && c.id !== course.id; })) return fail(st, "That link code is taken.");
    if (course.id) {
      var c = find(st.courses, course.id); if (!c) return fail(st, "No such course.");
      c.name = name; c.section = section; c.linkCode = code; c.enrolled = enrolled;
    } else {
      st.courses.push({ id: nextId(st, "crs_"), name: name, section: section, linkCode: code, enrolled: enrolled });
    }
    return ok(st);
  }
  function saveExam(state, now, userId, exam) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    exam = exam || {};
    var name = (exam.name || "").trim();
    if (!name) return fail(st, "Enter an exam name.");
    if (!validIso(exam.at)) return fail(st, "Enter the exam date and time.");
    if (exam.id) {
      var e = find(st.exams, exam.id); if (!e) return fail(st, "No such exam.");
      e.name = name; e.at = exam.at;
    } else {
      if (!find(st.courses, exam.courseId)) return fail(st, "No such course.");
      st.exams.push({ id: nextId(st, "exm_"), courseId: exam.courseId, name: name, at: exam.at });
    }
    return ok(st);
  }
  function saveSlot(state, now, userId, slot) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    slot = slot || {};
    if (!validIso(slot.start) || !validIso(slot.end)) return fail(st, "Enter a start and end time.");
    if (ms(slot.end) <= ms(slot.start)) return fail(st, "The end must be after the start.");
    var place = (slot.place || "").trim();
    if (!place) return fail(st, "Enter a place.");
    var spots = (slot.spots || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
    if (slot.vibe !== "quiet" && slot.vibe !== "chatty") return fail(st, "Pick quiet or chatty.");
    if (slot.id) {
      var s = find(st.slots, slot.id); if (!s) return fail(st, "No such slot.");
      if (s.status !== "open" || s.jobs.lockDone) return fail(st, "This slot has locked and can't be edited."); // Still open #10
      s.start = slot.start; s.end = slot.end; s.place = place; s.spots = spots; s.vibe = slot.vibe; // picks are kept (D29)
    } else {
      if (!find(st.exams, slot.examId)) return fail(st, "No such exam.");
      st.slots.push({ id: nextId(st, "slt_"), examId: slot.examId, start: slot.start, end: slot.end, place: place,
        spots: spots, vibe: slot.vibe, status: "open", jobs: { lockDone: false } });
    }
    return ok(st);
  }
  function setPilotEnd(state, now, userId, isoStr) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    if (!validIso(isoStr)) return fail(st, "Enter a date and time.");
    st.settings.pilotEnd = isoStr; return ok(st);
  }
  function decideCheckin(state, now, userId, checkinId, decision) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    if (decision !== "accepted" && decision !== "rejected") return fail(st, "Pick accept or reject.");
    var c = find(st.checkins, checkinId);
    if (!c || c.result !== "unverified") return fail(st, "Only unverified check-ins need review.");
    if (c.adminDecision) return fail(st, "This check-in was already reviewed.");
    c.adminDecision = decision;
    if (decision === "rejected") {
      var seat = find(st.seats, c.seatId);
      if (seat && !hasAttendance(st, seat)) { // a tablemate's "studied with" still counts (D36)
        seat.status = "no_show";
        giveMiss(st, seat, now); // D11
      }
    }
    return ok(st);
  }
  function decideReport(state, now, userId, reportId, decision) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    if (decision !== "accepted" && decision !== "rejected") return fail(st, "Pick accept or reject.");
    var r = find(st.reports, reportId); if (!r) return fail(st, "No such report.");
    if (r.adminDecision) return fail(st, "This report was already reviewed.");
    r.adminDecision = decision; // Still open #11: recording only
    return ok(st);
  }
  function removeMiss(state, now, userId, missId) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    var k = find(st.misses, missId); if (!k) return fail(st, "No such miss.");
    if (k.removed) return fail(st, "This miss was already removed.");
    k.removed = true; // seats already set to confirm early stay that way (D39)
    return ok(st);
  }

  SB.rules = {
    // timeline and IDs
    tick: tick, nextId: nextId,
    // transitions
    setLocation: setLocation, switchUser: switchUser, setPendingLink: setPendingLink,
    requestLink: requestLink, openLink: openLink, joinCourse: joinCourse, addCourse: addCourse, signOut: signOut,
    saveProfile: saveProfile, acceptConduct: acceptConduct, submitIntake: submitIntake, finishPermissions: finishPermissions,
    pick: pick, unpick: unpick, confirm: confirm, cantMakeIt: cantMakeIt, cancel: cancel, checkIn: checkIn,
    report: report, answerPost: answerPost, submitExit: submitExit, deleteAccount: deleteAccount,
    markRead: markRead,
    saveCourse: saveCourse, saveExam: saveExam, saveSlot: saveSlot, setPilotEnd: setPilotEnd,
    decideCheckin: decideCheckin, decideReport: decideReport, removeMiss: removeMiss,
    // reads
    examsFor: function (state, now, studentId) { return examsFor(copy(state), now, studentId); },
    slotCount: slotCount,
    canPick: canPick,
    seatActions: seatActions,
    tablemates: function (state, now, seatId) { return tablemates(copy(state), now, seatId); },
    recentMisses: recentMisses, isRecentMiss: isRecentMiss, reliability: reliability,
    postOpen: postOpen, surveyOpen: surveyOpen,
    slotWarnings: slotWarnings,
    metrics: metrics
  };
})();
