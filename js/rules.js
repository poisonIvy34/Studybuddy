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

  // ---------- strikes ----------
  function activeStrikes(state, studentId) {
    return state.strikes.filter(function (k) { return k.studentId === studentId && !k.removed; }).length;
  }
  function isPaused(state, now, studentId) {
    var s = student(state, studentId);
    return !!(s && s.pausedUntil && ms(now) < ms(s.pausedUntil));
  }

  // Mutates st (a copy). Gives a strike at `at` and applies the warning / pause rules.
  function giveStrike(st, studentId, seatId, at) {
    st.strikes.push({ id: nextId(st, "stk_"), studentId: studentId, seatId: seatId, at: at, removed: false });
    var n = activeStrikes(st, studentId);
    if (n === st.settings.strikeWarnAt) {
      notify(st, at, { to: studentId, kind: "strike_warning", route: "#/me",
        text: "You now have " + n + " strikes for missed sessions. A " + st.settings.strikePauseAt +
          "rd strike pauses sign-ups for " + st.settings.strikePauseDays + " days." });
    }
    if (n >= st.settings.strikePauseAt) applyPause(st, studentId, at);
  }

  function applyPause(st, studentId, at) {
    var s = student(st, studentId); if (!s) return;
    var until = SB.clock.add(at, { days: st.settings.strikePauseDays });
    if (s.pausedUntil && ms(s.pausedUntil) > ms(until)) until = s.pausedUntil;
    s.pausedUntil = until;
    var atMs = ms(at), untilMs = ms(until);
    st.picks.forEach(function (p) {
      if (p.studentId !== studentId || p.status !== "active") return;
      var slot = find(st.slots, p.slotId);
      if (slot && ms(slot.start) < untilMs) { p.status = "removed"; p.removedReason = "strike_pause"; }
    });
    st.seats.forEach(function (seat) {
      if (seat.studentId !== studentId || (seat.status !== "placed" && seat.status !== "confirmed")) return;
      var slot = slotOfSession(st, find(st.sessions, seat.sessionId));
      if (!slot) return;
      var startMs = ms(slot.start);
      // D8: sessions whose start falls in the 14 days (a session already under way is left alone)
      if (startMs >= atMs && startMs < untilMs) {
        seat.status = "cancelled"; seat.cancelledAt = at; seat.cancelReason = "strike_pause";
      }
    });
    notify(st, at, { to: studentId, kind: "strike_pause", route: "#/me",
      text: "You have " + activeStrikes(st, studentId) + " strikes, so sign-ups are paused until " +
        SB.clock.fmt(until, "full") + ". Your picks and sessions before then were cancelled." });
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
  var ORDER = { end: 0, start: 1, confirm: 2, lowTurnout: 3, lock: 4, pilotEnd: 5 };

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
        ["lowTurnout", T - s.lowTurnoutHoursBefore * 3600000, "lowTurnoutSent"],
        ["confirm", T - s.confirmMinutesBefore * 60000, "confirmSent"],
        ["start", T, "startDone"],
        ["end", E, "endDone"]
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
          jobs: { lowTurnoutSent: false, confirmSent: false, startDone: false, endDone: false } };
        st.sessions.push(ses);
        var members = picks.slice(idx, idx + size); idx += size;
        members.forEach(function (p) {
          p.status = "placed";
          st.seats.push({ id: nextId(st, "set_"), sessionId: ses.id, studentId: p.studentId, status: "placed",
            confirmedAt: null, cancelledAt: null, cancelReason: null });
        });
        tables.push({ ses: ses, ids: members.map(function (p) { return p.studentId; }) });
      }
      tables.forEach(function (tb) {
        tb.ids.forEach(function (sid) {
          var mates = firstNames(st, tb.ids.filter(function (x) { return x !== sid; }));
          notify(st, at, { to: sid, kind: "session_confirmed", route: "#/session/" + tb.ses.id,
            slotId: slot.id, sessionId: tb.ses.id,
            text: "Session confirmed: " + when + " at " + slot.place + ", " + tb.ses.spot + " (table " + tb.ses.table +
              "). Your table: " + (mates.length ? mates.join(", ") : "just you so far") + "." });
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

  function sessionSeats(st, sesId) { return st.seats.filter(function (x) { return x.sessionId === sesId; }); }

  function runJob(st, job) {
    var at = iso(job.t);
    var ses = job.session, slot = job.slot;
    switch (job.type) {
      case "lock": runLock(st, slot, at); break;
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
          if (x.status === "confirmed" && !hasValidCheckin(st, x.id)) {
            x.status = "no_show";
            giveStrike(st, x.studentId, x.id, at);
          }
        });
        sessionSeats(st, ses.id).forEach(function (x) {
          if (x.status !== "attended") return;
          notify(st, at, { to: x.studentId, kind: "post_session", route: "#/after/" + ses.id, slotId: slot.id,
            sessionId: ses.id, text: "How did it go? Tell us whether today's session left you more prepared." });
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
    if (isPaused(state, now, studentId)) return false;
    return !activePicks(state, slotId).some(function (p) { return p.studentId === studentId; });
  }

  function seatActions(state, now, seatId) {
    var r = { canConfirm: false, canCantMakeIt: false, canCancel: false, canCheckIn: false, canReport: false };
    var cx = seatContext(state, seatId); if (!cx) return r;
    var n = ms(now), T = ms(cx.slot.start), E = ms(cx.slot.end), s = state.settings, st = cx.seat.status;
    var live = st === "placed" || st === "confirmed";
    r.canConfirm = r.canCantMakeIt = st === "placed" && n >= T - s.confirmMinutesBefore * 60000 && n < T;
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
    var from = ms(SB.clock.add(exam.at, { days: -5 })), examMs = ms(exam.at);
    if (ms(slot.start) < from || ms(slot.end) > examMs) {
      w.push("This slot isn't in the 5 days before the exam (" + SB.clock.fmt(exam.at, "dayTime") + ").");
    }
    return w;
  }

  function examsFor(state, now, studentId) {
    var s = student(state, studentId);
    var out = { sessions: [], exams: [], noCourses: true, pausedUntil: null };
    if (!s) return out;
    out.noCourses = s.courseIds.length === 0;
    out.pausedUntil = isPaused(state, now, studentId) ? s.pausedUntil : null;
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
        if (hasValidCheckin(st, seat.id)) suValid++;
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
        onboarding: { profile: false, conduct: false, intake: false, permissions: false }, pausedUntil: null };
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
      if (isPaused(st, now, userId)) return fail(st, "Sign-ups are paused until " + SB.clock.fmt(student(st, userId).pausedUntil, "full") + ".");
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
  function cantMakeIt(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canCantMakeIt", function (st, seat) {
      seat.status = "cancelled"; seat.cancelledAt = now; seat.cancelReason = "cant_make_it";
    });
  }
  function cancel(state, now, userId, seatId) {
    return seatOp(state, now, userId, seatId, "canCancel", function (st, seat) {
      seat.status = "cancelled"; seat.cancelledAt = now; seat.cancelReason = "student";
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
  function answerPost(state, now, userId, seatId, answer) {
    var st = copy(state), err = needStudent(st, userId); if (err) return fail(st, err);
    if (!ownSeat(st, userId, seatId)) return fail(st, "That isn't your session.");
    if (["more", "same", "less"].indexOf(answer) < 0) return fail(st, "Pick one answer.");
    if (!postOpen(st, now, seatId)) return fail(st, "This question isn't open.");
    if (st.postAnswers.some(function (a) { return a.seatId === seatId; })) return fail(st, "You already answered.");
    st.postAnswers.push({ seatId: seatId, answer: answer, at: now });
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
    st.strikes = st.strikes.filter(function (k) { return k.studentId !== userId && !seatIds[k.seatId]; });
    st.checkins = st.checkins.filter(function (c) { return !seatIds[c.seatId]; });
    st.postAnswers = st.postAnswers.filter(function (a) { return !seatIds[a.seatId]; });
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
      if (seat && !hasValidCheckin(st, seat.id)) {
        seat.status = "no_show";
        giveStrike(st, seat.studentId, seat.id, now); // D11, D23
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
  function removeStrike(state, now, userId, strikeId) {
    var st = copy(state), err = needAdmin(st, userId); if (err) return fail(st, err);
    var k = find(st.strikes, strikeId); if (!k) return fail(st, "No such strike.");
    if (k.removed) return fail(st, "This strike was already removed.");
    k.removed = true;
    var s = student(st, k.studentId);
    if (s && s.pausedUntil && activeStrikes(st, s.id) < st.settings.strikePauseAt) s.pausedUntil = null; // D22
    return ok(st);
  }

  SB.rules = {
    // timeline and IDs
    tick: tick, nextId: nextId,
    // transitions
    setLocation: setLocation, switchUser: switchUser, setPendingLink: setPendingLink,
    requestLink: requestLink, openLink: openLink, joinCourse: joinCourse, signOut: signOut,
    saveProfile: saveProfile, acceptConduct: acceptConduct, submitIntake: submitIntake, finishPermissions: finishPermissions,
    pick: pick, unpick: unpick, confirm: confirm, cantMakeIt: cantMakeIt, cancel: cancel, checkIn: checkIn,
    report: report, answerPost: answerPost, submitExit: submitExit, deleteAccount: deleteAccount,
    markRead: markRead,
    saveCourse: saveCourse, saveExam: saveExam, saveSlot: saveSlot, setPilotEnd: setPilotEnd,
    decideCheckin: decideCheckin, decideReport: decideReport, removeStrike: removeStrike,
    // reads
    examsFor: function (state, now, studentId) { return examsFor(copy(state), now, studentId); },
    slotCount: slotCount,
    canPick: canPick,
    seatActions: seatActions,
    tablemates: function (state, now, seatId) { return tablemates(copy(state), now, seatId); },
    activeStrikes: activeStrikes, isPaused: isPaused,
    postOpen: postOpen, surveyOpen: surveyOpen,
    slotWarnings: slotWarnings,
    metrics: metrics
  };
})();
