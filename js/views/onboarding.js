/* js/views/onboarding.js — the four one-time sign-up steps:
 *   #/onboarding/profile → conduct → intake → permissions
 * The router guard stops skipping ahead; this screen shows a step indicator and a Back button.
 * All validation and state changes go through SB.store (saveProfile, acceptConduct, submitIntake,
 * finishPermissions). Unsaved input lives in a per-user draft so a re-render (e.g. the demo clock
 * moving) doesn't wipe it.
 */
(function () {
  var SB = (window.SB = window.SB || {});

  var STEPS = [
    { key: "profile", label: "Profile" },
    { key: "conduct", label: "Code of conduct" },
    { key: "intake", label: "Quick survey" },
    { key: "permissions", label: "Permissions" }
  ];
  var YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];

  var drafts = {}; // userId → { profile, conduct, intake, perms }

  function me() {
    var st = SB.store.get();
    var id = st.demo.currentUserId;
    return (st.students || []).find(function (s) { return s.id === id; }) || null;
  }

  function draftFor(stu) {
    if (!drafts[stu.id]) {
      var st = SB.store.get();
      var prev = (st.surveyAnswers || []).find(function (a) { return a.studentId === stu.id && a.kind === "intake"; });
      drafts[stu.id] = {
        profile: { firstName: stu.firstName || "", year: stu.year || null, vibe: stu.vibe || null },
        conduct: !!(stu.onboarding && stu.onboarding.conduct),
        intake: prev ? JSON.parse(JSON.stringify(prev.answers)) : {},
        perms: { notifications: null, location: null }
      };
    }
    return drafts[stu.id];
  }

  function stepIndex(key) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === key) return i;
    return -1;
  }

  // Error box updated in place, so the form isn't redrawn.
  function errorBox() {
    var h = SB.ui.h;
    var box = h("div", { class: "notice notice-error hidden", role: "alert" });
    box.show = function (msg) {
      box.textContent = msg || "";
      box.classList.toggle("hidden", !msg);
      if (msg && box.scrollIntoView) { try { box.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }
    };
    return box;
  }

  function header(key) {
    var h = SB.ui.h;
    var idx = stepIndex(key);
    return h(
      "div",
      { class: "v-onboarding-head" },
      h(
        "div",
        { class: "row-between" },
        idx > 0
          ? h("button", { type: "button", class: "btn btn-link v-onboarding-back", onclick: function () { SB.router.go("#/onboarding/" + STEPS[idx - 1].key); } }, "‹ Back")
          : h("span", { class: "v-onboarding-back-spacer" }),
        h("span", { class: "muted small" }, "Step " + (idx + 1) + " of " + STEPS.length)
      ),
      h(
        "ol",
        { class: "v-onboarding-steps", "aria-label": "Sign-up steps" },
        STEPS.map(function (s, i) {
          return h(
            "li",
            { class: ["v-onboarding-step", i < idx && "done", i === idx && "current"], "aria-current": i === idx ? "step" : null },
            h("span", { class: "v-onboarding-dot" }, i < idx ? "✓" : String(i + 1)),
            h("span", { class: "v-onboarding-step-label" }, s.label)
          );
        })
      )
    );
  }

  // A group of big tappable options; selection updates in place.
  function choiceGroup(options, current, onPick, className) {
    var h = SB.ui.h;
    var wrap = h("div", { class: className || "choice-list", role: "radiogroup" });
    options.forEach(function (o) {
      var btn = h(
        "button",
        {
          type: "button",
          class: ["choice", o.value === current && "selected"],
          role: "radio",
          "aria-checked": o.value === current ? "true" : "false",
          onclick: function () {
            Array.prototype.forEach.call(wrap.children, function (c) {
              c.classList.remove("selected");
              c.setAttribute("aria-checked", "false");
            });
            btn.classList.add("selected");
            btn.setAttribute("aria-checked", "true");
            onPick(o.value);
          }
        },
        o.label,
        o.sub ? h("span", { class: "v-onboarding-choice-sub" }, o.sub) : null
      );
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function scaleGroup(current, onPick) {
    var h = SB.ui.h;
    var wrap = h("div", { class: "scale", role: "radiogroup" });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var btn = h(
        "button",
        {
          type: "button",
          class: [n === current && "selected"],
          role: "radio",
          "aria-checked": n === current ? "true" : "false",
          onclick: function () {
            Array.prototype.forEach.call(wrap.children, function (c) {
              c.classList.remove("selected");
              c.setAttribute("aria-checked", "false");
            });
            btn.classList.add("selected");
            btn.setAttribute("aria-checked", "true");
            onPick(n);
          }
        },
        String(n)
      );
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function page(key, title, intro, body) {
    var h = SB.ui.h;
    return h(
      "div",
      { class: "v-onboarding" },
      header(key),
      h("h1", null, title),
      intro ? h("p", { class: "muted" }, intro) : null,
      body
    );
  }

  // ---------- Step 1: profile ----------
  function renderProfile(params, mount) {
    var h = SB.ui.h;
    var stu = me();
    if (!stu) return;
    var d = draftFor(stu).profile;
    var err = errorBox();

    var nameInput = h("input", {
      type: "text", value: d.firstName, autocomplete: "given-name", maxlength: "40", placeholder: "First name",
      oninput: function (e) { d.firstName = e.target.value; }
    });

    function submit() {
      var r = SB.store.saveProfile({ firstName: d.firstName, year: d.year, vibe: d.vibe });
      if (!r.ok) { err.show(r.error); return; }
      SB.router.go("#/onboarding/conduct");
    }

    mount.appendChild(
      page(
        "profile",
        "Tell us about you",
        "Your tablemates see only your first name and year. No photo needed.",
        h(
          "form",
          { class: "card", novalidate: true, onsubmit: function (e) { e.preventDefault(); submit(); } },
          err,
          SB.ui.field("First name", nameInput),
          h(
            "div",
            { class: "field" },
            h("span", { class: "field-label" }, "Year"),
            choiceGroup(
              YEARS.map(function (y) { return { value: y, label: y }; }),
              d.year,
              function (v) { d.year = v; },
              "choice-list v-onboarding-years"
            )
          ),
          h(
            "div",
            { class: "field" },
            h("span", { class: "field-label" }, "How do you like to study?"),
            choiceGroup(
              [
                { value: "quiet", label: "Quiet", sub: "Heads down, working side by side." },
                { value: "chatty", label: "Chatty", sub: "Talk through problems together." }
              ],
              d.vibe,
              function (v) { d.vibe = v; }
            ),
            h("span", { class: "field-hint" }, "We sort matching sessions first. You'll still see every session.")
          ),
          h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Continue")
        )
      )
    );
  }

  // ---------- Step 2: code of conduct ----------
  function renderConduct(params, mount) {
    var h = SB.ui.h;
    var stu = me();
    if (!stu) return;
    var draft = draftFor(stu);
    var err = errorBox();
    var text = SB.store.get().conductText || "";

    var box = h("input", {
      type: "checkbox", checked: draft.conduct,
      onchange: function (e) { draft.conduct = e.target.checked; if (draft.conduct) err.show(""); }
    });

    function submit() {
      if (!draft.conduct) { err.show("Check the box to agree to the code of conduct."); return; }
      var r = SB.store.acceptConduct();
      if (!r.ok) { err.show(r.error); return; }
      SB.router.go("#/onboarding/intake");
    }

    mount.appendChild(
      page(
        "conduct",
        "Code of conduct",
        "Please read this before your first session.",
        h(
          "div",
          { class: "card" },
          err,
          h(
            "div",
            { class: "v-onboarding-conduct", tabindex: "0" },
            text.split(/\n\s*\n/).map(function (para) { return h("p", null, para); })
          ),
          h("label", { class: "checkbox-line" }, box, h("span", null, "I've read the code of conduct and I agree to follow it.")),
          SB.ui.button("I agree, continue", submit, { kind: "primary", class: "btn-block" })
        )
      )
    );
  }

  // ---------- Step 3: intake survey ----------
  function renderIntake(params, mount) {
    var h = SB.ui.h;
    var stu = me();
    if (!stu) return;
    var answers = draftFor(stu).intake;
    var err = errorBox();
    var questions = (SB.store.get().surveys && SB.store.get().surveys.intake) || [];

    function question(q, i) {
      var label = h(
        "span",
        { class: "field-label" },
        (i + 1) + ". " + q.text,
        q.type !== "text" ? h("span", { class: "v-onboarding-req", "aria-label": "required" }, " *") : null
      );
      var input;
      if (q.type === "yesno") {
        input = choiceGroup(
          [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
          answers[q.id],
          function (v) { answers[q.id] = v; },
          "choice-list v-onboarding-yesno"
        );
      } else if (q.type === "scale5") {
        input = scaleGroup(answers[q.id], function (v) { answers[q.id] = v; });
      } else if (q.type === "choice") {
        input = choiceGroup(
          (q.options || []).map(function (o) { return { value: o, label: o }; }),
          answers[q.id],
          function (v) { answers[q.id] = v; }
        );
      } else {
        input = h("textarea", {
          rows: "3", maxlength: "1000",
          oninput: function (e) { answers[q.id] = e.target.value; }
        });
        input.value = typeof answers[q.id] === "string" ? answers[q.id] : "";
      }
      return h("div", { class: "field v-onboarding-q" }, label, input);
    }

    function submit() {
      var out = {};
      questions.forEach(function (q) {
        var v = answers[q.id];
        if (q.type === "text") out[q.id] = typeof v === "string" ? v : "";
        else if (v !== undefined && v !== null) out[q.id] = v;
      });
      var r = SB.store.submitIntake(out);
      if (!r.ok) { err.show(r.error); return; }
      SB.router.go("#/onboarding/permissions");
    }

    mount.appendChild(
      page(
        "intake",
        "A quick survey",
        "This helps us learn whether StudyBuddy works. Questions marked * are required.",
        h(
          "div",
          { class: "card" },
          err,
          questions.length ? questions.map(question) : SB.ui.empty("No survey questions."),
          SB.ui.button("Continue", submit, { kind: "primary", class: "btn-block" })
        )
      )
    );
  }

  // ---------- Step 4: permissions (simulated) ----------
  function renderPermissions(params, mount) {
    var h = SB.ui.h;
    var stu = me();
    if (!stu) return;
    var perms = draftFor(stu).perms;
    var err = errorBox();

    function prompt(key, title, why) {
      var status = h("p", { class: "small v-onboarding-perm-status" });
      function showStatus() {
        status.textContent =
          perms[key] === "allow" ? "Allowed." :
          perms[key] === "deny" ? "Not allowed. You can still use StudyBuddy." : "";
        status.className = "small v-onboarding-perm-status " + (perms[key] === "allow" ? "success" : "muted");
      }
      showStatus();
      return h(
        "div",
        { class: "card v-onboarding-perm" },
        h("div", { class: "card-title" }, title),
        h("p", { class: "muted small" }, why),
        choiceGroup(
          [{ value: "allow", label: "Allow" }, { value: "deny", label: "Don't allow" }],
          perms[key],
          function (v) { perms[key] = v; showStatus(); err.show(""); },
          "choice-list v-onboarding-yesno"
        ),
        status
      );
    }

    function submit() {
      if (!perms.notifications || !perms.location) { err.show("Choose Allow or Don't allow for both prompts."); return; }
      var r = SB.store.finishPermissions(); // D28: the choices themselves change nothing
      if (!r.ok) { err.show(r.error); return; }
      delete drafts[stu.id];
      SB.router.go("#/exams");
    }

    mount.appendChild(
      page(
        "permissions",
        "Two quick permissions",
        "This is a demo, so these prompts are simulated.",
        h(
          "div",
          null,
          err,
          prompt("notifications", "Notifications", "We'll tell you when a session is confirmed, ask \"Still coming?\" 30 minutes before, and check in after."),
          prompt("location", "Location", "Checked once, only when you tap I'm here, to confirm you're at the session. We never store where you are."),
          SB.ui.button("Finish sign-up", submit, { kind: "primary", class: "btn-block" })
        )
      )
    );
  }

  SB.router.register("/onboarding/profile", renderProfile);
  SB.router.register("/onboarding/conduct", renderConduct);
  SB.router.register("/onboarding/intake", renderIntake);
  SB.router.register("/onboarding/permissions", renderPermissions);
})();
