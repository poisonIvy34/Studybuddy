/* js/views/me.js — #/me: the student's own profile and preference (editable), their own strike
   warning or pause notice, the exit survey link, joined courses, sign out and delete account.
   Reads state only; every change goes through SB.store. Shows nothing about other students. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});

  var YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];
  var VIBES = [
    { value: "quiet", label: "Quiet", hint: "Heads down, little talking" },
    { value: "chatty", label: "Chatty", hint: "Talk problems through together" }
  ];

  // Screen-only UI state. The router redraws on every store change, so it lives here.
  var ui = { userId: null, editing: false, draft: null, flash: null, error: null, confirmDelete: false, deleteError: null };

  function resetUi(userId) {
    ui = { userId: userId, editing: false, draft: null, flash: null, error: null, confirmDelete: false, deleteError: null };
  }

  function redraw() { SB.router.render(); }

  function render(params, mount) {
    var h = SB.ui.h, card = SB.ui.card, button = SB.ui.button;
    var state = SB.store.get();
    var now = SB.clock.now();
    var me = (state.students || []).find(function (s) { return s.id === state.demo.currentUserId; });
    if (!me) {
      mount.appendChild(SB.ui.empty("Sign in as a student to see your profile."));
      return;
    }
    if (ui.userId !== me.id) resetUi(me.id);

    var root = h("div", { class: "v-me" });
    root.appendChild(h("h1", null, "Me"));

    // ---- Own strike status (never shown to anyone else) ----
    var strikes = SB.rules.activeStrikes(state, me.id);
    if (SB.rules.isPaused(state, now, me.id)) {
      root.appendChild(h("div", { class: "notice notice-error v-me-status", role: "status" },
        h("div", { class: "strong" }, "Sign-ups are paused"),
        h("div", null, "You missed sessions you had confirmed, so you can't pick times until " +
          SB.clock.fmt(me.pausedUntil, "full") + ". Picks and sessions in that period were cancelled.")));
    } else if (strikes >= 2) {
      root.appendChild(h("div", { class: "notice notice-warn v-me-status", role: "status" },
        h("div", { class: "strong" }, "You have " + strikes + " strikes"),
        h("div", null, "A strike comes from confirming a session and not checking in. One more pauses your sign-ups for 14 days.")));
    }

    // ---- Exit survey ----
    if (SB.rules.surveyOpen(state, now)) {
      var done = (state.surveyAnswers || []).some(function (a) { return a.studentId === me.id && a.kind === "exit"; });
      root.appendChild(card(
        h("div", { class: "card-title" }, "Pilot survey"),
        done
          ? h("p", { class: "muted small" }, "Thanks, you've answered the pilot survey.")
          : [
              h("p", { class: "card-sub" }, "The pilot is wrapping up. Tell us how StudyBuddy went. It takes about 2 minutes."),
              h("a", { class: "btn btn-primary btn-block", href: "#/survey/exit" }, "Take the survey")
            ]
      ));
    }

    // ---- Profile ----
    root.appendChild(h("div", { class: "section-title" }, "Profile"));
    root.appendChild(ui.editing ? profileForm(me) : profileView(me));

    // ---- Courses ----
    root.appendChild(h("div", { class: "section-title" }, "Your courses"));
    var courses = (me.courseIds || []).map(function (id) {
      return (state.courses || []).find(function (c) { return c.id === id; });
    }).filter(Boolean);
    root.appendChild(card(
      courses.length
        ? courses.map(function (c) {
            return h("div", { class: "card-row" },
              h("span", { class: "strong" }, c.name),
              h("span", { class: "muted small v-me-section" }, "Section " + c.section));
          })
        : h("p", { class: "muted small" }, "No courses yet. Open your course link to add a course."),
      h("p", { class: "muted small v-me-note" }, "To add a course, open the link your professor shared.")
    ));

    // ---- Account ----
    root.appendChild(h("div", { class: "section-title" }, "Account"));
    root.appendChild(card(
      button("Sign out", function () {
        var r = SB.store.signOut();
        if (!r.ok) { ui.deleteError = r.error; redraw(); }
      }, { kind: "secondary", class: "btn-block" }),
      ui.confirmDelete ? deleteConfirm() : h("div", { class: "mt" },
        button("Delete account", function () {
          ui.confirmDelete = true; ui.deleteError = null; redraw();
        }, { kind: "danger", class: "btn-block" })),
      ui.deleteError ? h("p", { class: "error small" }, ui.deleteError) : null
    ));

    mount.appendChild(root);
  }

  function profileView(me) {
    var h = SB.ui.h;
    var vibe = VIBES.find(function (v) { return v.value === me.vibe; });
    return SB.ui.card(
      ui.flash ? h("div", { class: "notice notice-ok", role: "status" }, ui.flash) : null,
      h("div", { class: "card-row" }, h("span", { class: "muted" }, "First name"), h("span", { class: "strong" }, me.firstName || "—")),
      h("div", { class: "card-row" }, h("span", { class: "muted" }, "Year"), h("span", { class: "strong" }, me.year || "—")),
      h("div", { class: "card-row" }, h("span", { class: "muted" }, "Study style"),
        vibe ? h("span", { class: "tag tag-" + vibe.value }, vibe.label) : h("span", null, "—")),
      h("p", { class: "muted small v-me-note" }, "Your style sorts and labels times on the Exams tab. It never hides any."),
      h("div", { class: "card-actions" },
        SB.ui.button("Edit profile", function () {
          ui.editing = true; ui.flash = null; ui.error = null;
          ui.draft = { firstName: me.firstName || "", year: me.year || "", vibe: me.vibe || "" };
          redraw();
        }, { kind: "secondary" }))
    );
  }

  function profileForm(me) {
    var h = SB.ui.h, field = SB.ui.field, button = SB.ui.button;
    var d = ui.draft;

    var nameInput = h("input", { type: "text", value: d.firstName, maxlength: 40, autocomplete: "given-name",
      oninput: function (e) { d.firstName = e.target.value; } });
    var yearSelect = h("select", { onchange: function (e) { d.year = e.target.value; } },
      h("option", { value: "", selected: !d.year, disabled: true }, "Pick your year"),
      YEARS.map(function (y) { return h("option", { value: y, selected: d.year === y }, y); }));

    var vibeList = h("div", { class: "choice-list", role: "radiogroup" },
      VIBES.map(function (v) {
        return h("button", {
          type: "button", role: "radio", "aria-checked": d.vibe === v.value ? "true" : "false",
          class: ["choice", d.vibe === v.value && "selected"],
          onclick: function () { d.vibe = v.value; redraw(); }
        }, v.label, h("span", { class: "v-me-choice-hint" }, v.hint));
      }));

    function save() {
      var r = SB.store.saveProfile({ firstName: d.firstName, year: d.year, vibe: d.vibe });
      if (r.ok) {
        ui.editing = false; ui.draft = null; ui.error = null; ui.flash = "Profile saved.";
      } else {
        ui.error = r.error;
      }
      redraw();
    }

    return SB.ui.card(
      field("First name", nameInput),
      field("Year", yearSelect),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Study style"), vibeList,
        h("span", { class: "field-hint" }, "Sorts and labels times. It never hides any.")),
      ui.error ? h("div", { class: "notice notice-error", role: "alert" }, ui.error) : null,
      h("div", { class: "btn-group" },
        button("Save", save, { kind: "primary" }),
        button("Cancel", function () { ui.editing = false; ui.draft = null; ui.error = null; redraw(); }, { kind: "secondary" }))
    );
  }

  function deleteConfirm() {
    var h = SB.ui.h, button = SB.ui.button;
    return h("div", { class: "notice notice-error mt v-me-delete", role: "alert" },
      h("div", { class: "strong" }, "Delete your account?"),
      h("p", null, "This removes your profile, picks, sessions, check-ins, answers and notifications right away. It can't be undone."),
      h("div", { class: "btn-group" },
        button("Delete now", function () {
          var r = SB.store.deleteAccount();
          if (r.ok) { resetUi(null); }
          else { ui.deleteError = r.error; ui.confirmDelete = false; redraw(); }
        }, { kind: "danger" }),
        button("Keep my account", function () { ui.confirmDelete = false; redraw(); }, { kind: "secondary" }))
    );
  }

  SB.router.register("/me", render);
})();
