/* js/views/after.js — the post-session question (#/after/:sessionId) and the exit survey with NPS
   (#/survey/exit). Reads state; open/closed decisions come from SB.rules.postOpen and SB.rules.surveyOpen;
   writes go through SB.store.answerPost and SB.store.submitExit. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});

  var POST_OPTIONS = [
    { value: "more", label: "More prepared" },
    { value: "same", label: "About the same" },
    { value: "less", label: "Less prepared" }
  ];
  var POST_LABEL = { more: "More prepared", same: "About the same", less: "Less prepared" };
  var NPS_TEXT = "How likely are you to recommend StudyBuddy to a classmate?";

  // Unsent choices survive re-renders (the router redraws on every state change).
  var postDraft = {};   // seatId -> "more" | "same" | "less"
  var postError = {};   // seatId -> string
  var exitDraft = {};   // studentId -> { answers: {}, nps: number | null, error: string | null }

  function find(arr, id) {
    for (var i = 0; i < (arr || []).length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function me(state) {
    var id = state.demo.currentUserId;
    return find(state.students, id);
  }
  function rerender(fn, params, mount) {
    mount.innerHTML = "";
    fn(params, mount);
  }

  // ---------- #/after/:id (session id) ----------

  function sessionHeader(h, state, session) {
    var slot = find(state.slots, session.slotId);
    var exam = slot ? find(state.exams, slot.examId) : null;
    var course = exam ? find(state.courses, exam.courseId) : null;
    var title = (course ? course.name.split(":")[0] + " " : "") + (exam ? exam.name : "Study session");
    return h("div", { class: "v-after-head" },
      h("div", { class: "section-title" }, "Study session"),
      h("h1", null, title),
      slot ? h("p", { class: "muted small" },
        SB.clock.fmt(slot.start, "dayTime") + "–" + SB.clock.fmt(slot.end, "time") + " · " +
        slot.place + (session.spot ? ", " + session.spot : "")) : null
    );
  }

  function nextExamCard(h) {
    return h("div", { class: "card highlight v-after-next" },
      h("div", { class: "card-title" }, "Pick times for your next exam"),
      h("p", { class: "muted small" }, "Study sessions fill up before they lock, 48 hours ahead. Choose a few times that work for you."),
      h("a", { class: "btn btn-primary btn-block", href: "#/exams" }, "Pick times")
    );
  }

  function backLink(h) {
    return h("p", { class: "center mt" }, h("a", { class: "btn-link", href: "#/exams" }, "Back to Exams"));
  }

  function renderAfter(params, mount) {
    var h = SB.ui.h;
    var state = SB.store.get();
    var now = SB.clock.now();
    var stu = me(state);
    var root = h("div", { class: "v-after stack" });
    mount.appendChild(root);

    var session = find(state.sessions, params.id);
    var seat = session && stu ? state.seats.filter(function (x) {
      return x.sessionId === session.id && x.studentId === stu.id;
    })[0] : null;

    if (!session || !seat) {
      root.appendChild(SB.ui.card(
        h("h2", null, "Session not found"),
        h("p", { class: "muted" }, "This link isn't for one of your study sessions.")
      ));
      root.appendChild(backLink(h));
      return;
    }

    root.appendChild(sessionHeader(h, state, session));

    var answer = state.postAnswers.filter(function (a) { return a.seatId === seat.id; })[0];
    if (answer) {
      root.appendChild(h("div", { class: "card v-after-done" },
        h("div", { class: "v-after-check", "aria-hidden": "true" }, "✓"),
        h("h2", null, "Thanks for telling us"),
        h("p", { class: "muted" }, "You said: ", h("span", { class: "strong" }, POST_LABEL[answer.answer] || answer.answer), ".")
      ));
      root.appendChild(nextExamCard(h));
      return;
    }

    var slot = find(state.slots, session.slotId);
    if (!SB.rules.postOpen(state, now, seat.id)) {
      var msg, sub = null;
      var ended = slot && SB.clock.toMs(now) >= SB.clock.toMs(slot.end);
      var stillIn = seat.status === "placed" || seat.status === "confirmed" || seat.status === "attended";
      if (!stillIn || (ended && seat.status !== "attended")) {
        msg = "This question is only for students who checked in at the session.";
      } else if (!ended && slot) {
        msg = "This question opens when the session ends.";
        sub = "Check back after " + SB.clock.fmt(slot.end, "dayTime") + ".";
      } else {
        msg = "This question has closed.";
        sub = "It was open for " + state.settings.postWindowHours + " hours after the session ended.";
      }
      root.appendChild(SB.ui.card(
        h("h2", null, "Not open right now"),
        h("p", null, msg),
        sub ? h("p", { class: "muted small" }, sub) : null
      ));
      root.appendChild(backLink(h));
      return;
    }

    var picked = postDraft[seat.id] || null;
    var closes = slot ? SB.clock.add(slot.end, { hours: state.settings.postWindowHours }) : null;
    var redraw = function () { rerender(renderAfter, params, mount); };

    var c = h("div", { class: "card v-after-q" },
      h("h2", null, "Do you feel more prepared than studying alone?"),
      h("div", { class: "choice-list", role: "radiogroup" },
        POST_OPTIONS.map(function (o) {
          return h("button", {
            type: "button", class: ["choice", picked === o.value && "selected"], role: "radio",
            "aria-checked": picked === o.value ? "true" : "false",
            onclick: function () { postDraft[seat.id] = o.value; postError[seat.id] = null; redraw(); }
          }, o.label);
        })
      ),
      postError[seat.id] ? h("div", { class: "notice notice-error mt" }, postError[seat.id]) : null,
      h("div", { class: "card-actions mt" },
        SB.ui.button("Send answer", function () {
          var r = SB.store.answerPost(seat.id, postDraft[seat.id]);
          if (r.ok) { delete postDraft[seat.id]; delete postError[seat.id]; }
          else { postError[seat.id] = r.error; redraw(); }
        }, { kind: "primary", class: "btn-block", disabled: !picked })
      ),
      closes ? h("p", { class: "muted small center mt" }, "Open until " + SB.clock.fmt(closes, "dayTime") + ".") : null
    );
    root.appendChild(c);
  }

  // ---------- #/survey/exit ----------

  function questionBlock(h, q, draft, redraw) {
    var v = draft.answers[q.id];
    var set = function (val) { draft.answers[q.id] = val; draft.error = null; redraw(); };
    var control;
    if (q.type === "yesno") {
      control = h("div", { class: "v-after-yesno" }, [["yes", "Yes"], ["no", "No"]].map(function (o) {
        return h("button", { type: "button", class: ["choice", v === o[0] && "selected"],
          "aria-pressed": v === o[0] ? "true" : "false", onclick: function () { set(o[0]); } }, o[1]);
      }));
    } else if (q.type === "scale5") {
      control = h("div", { class: "scale" }, [1, 2, 3, 4, 5].map(function (n) {
        return h("button", { type: "button", class: [v === n && "selected"],
          "aria-pressed": v === n ? "true" : "false", onclick: function () { set(n); } }, String(n));
      }));
    } else if (q.type === "choice") {
      control = h("div", { class: "choice-list" }, (q.options || []).map(function (opt) {
        return h("button", { type: "button", class: ["choice", v === opt && "selected"],
          "aria-pressed": v === opt ? "true" : "false", onclick: function () { set(opt); } }, opt);
      }));
    } else {
      control = h("textarea", { value: typeof v === "string" ? v : "", placeholder: "Optional",
        oninput: function (e) { draft.answers[q.id] = e.target.value; } });
    }
    return h("div", { class: "v-after-question" },
      h("div", { class: "field-label" }, q.text),
      control
    );
  }

  function renderExit(params, mount) {
    var h = SB.ui.h;
    var state = SB.store.get();
    var now = SB.clock.now();
    var stu = me(state);
    var root = h("div", { class: "v-after stack" });
    mount.appendChild(root);
    root.appendChild(h("div", { class: "v-after-head" },
      h("div", { class: "section-title" }, "Pilot wrap-up"),
      h("h1", null, "Exit survey")
    ));

    if (!stu) {
      root.appendChild(SB.ui.card(h("p", { class: "muted" }, "Sign in as a student to take the exit survey.")));
      return;
    }

    var done = state.surveyAnswers.some(function (a) { return a.studentId === stu.id && a.kind === "exit"; });
    if (done) {
      root.appendChild(h("div", { class: "card v-after-done" },
        h("div", { class: "v-after-check", "aria-hidden": "true" }, "✓"),
        h("h2", null, "Thanks, " + stu.firstName + "!"),
        h("p", { class: "muted" }, "Your answers help us decide what StudyBuddy does next.")
      ));
      root.appendChild(backLink(h));
      return;
    }

    if (!SB.rules.surveyOpen(state, now)) {
      var pe = state.settings.pilotEnd;
      root.appendChild(SB.ui.card(
        h("h2", null, "Not open yet"),
        h("p", null, pe ? "The exit survey opens on " + SB.clock.fmt(pe, "full") + "." : "The exit survey opens when the pilot ends."),
        h("p", { class: "muted small" }, "We'll send you a notification when it's ready.")
      ));
      root.appendChild(backLink(h));
      return;
    }

    var draft = exitDraft[stu.id] || (exitDraft[stu.id] = { answers: {}, nps: null, error: null });
    var redraw = function () { rerender(renderExit, params, mount); };
    var questions = (state.surveys && state.surveys.exit) || [];

    root.appendChild(h("p", { class: "muted small" }, "A few quick questions about the pilot. About 2 minutes."));

    var form = h("div", { class: "card v-after-form" },
      questions.map(function (q) { return questionBlock(h, q, draft, redraw); }),
      h("div", { class: "v-after-question" },
        h("div", { class: "field-label" }, NPS_TEXT),
        h("div", { class: "scale v-after-nps" }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
          return h("button", { type: "button", class: [draft.nps === n && "selected"],
            "aria-pressed": draft.nps === n ? "true" : "false",
            onclick: function () { draft.nps = n; draft.error = null; redraw(); } }, String(n));
        })),
        h("div", { class: "row-between small muted v-after-ends" },
          h("span", null, "Not likely"), h("span", null, "Very likely"))
      ),
      draft.error ? h("div", { class: "notice notice-error" }, draft.error) : null,
      SB.ui.button("Send survey", function () {
        var r = SB.store.submitExit(draft.answers, draft.nps);
        if (r.ok) { delete exitDraft[stu.id]; }
        else { draft.error = r.error; redraw(); }
      }, { kind: "primary", class: "btn-block" })
    );
    root.appendChild(form);
  }

  SB.router.register("/after/:id", renderAfter);
  SB.router.register("/survey/exit", renderExit);
})();
