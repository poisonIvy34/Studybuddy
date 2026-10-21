/* js/views/signin.js — course link landing (#/join/:linkCode), sign-in (#/signin) and the
 * "Link sent" screen. No business logic: email checks and sign-in live in SB.rules via SB.store.
 *
 * Local screen state (not product state) lives in `ui` below so it survives the redraws the
 * router does on every store change:
 *   draft  – what the user has typed
 *   error  – the last error text from a store action
 *   sentTo – the email the demo link was "sent" to (shows the Link sent screen)
 */
(function () {
  var SB = (window.SB = window.SB || {});

  var ui = { draft: "", error: null, sentTo: null, route: null };

  function courseForCode(state, code) {
    return (state.courses || []).filter(function (c) { return c.linkCode === code; })[0] || null;
  }

  // Clear the screen state when the user moves between the two routes.
  function enter(routeKey) {
    if (ui.route !== routeKey) {
      ui.route = routeKey;
      ui.error = null;
      ui.sentTo = null;
    }
  }

  function emailForm(h, mount, redraw) {
    var input = h("input", {
      type: "email",
      id: "signin-email",
      name: "email",
      autocomplete: "email",
      inputmode: "email",
      placeholder: "netid@byu.edu",
      value: ui.draft,
      "aria-invalid": ui.error ? "true" : null,
      "aria-describedby": "signin-hint",
      oninput: function (e) { ui.draft = e.target.value; }
    });

    function submit(e) {
      if (e) e.preventDefault();
      ui.draft = input.value;
      var r = SB.store.requestLink(ui.draft);
      if (!r.ok) {
        ui.error = r.error;
        ui.sentTo = null;
      } else {
        ui.error = null;
        ui.sentTo = ui.draft.trim();
      }
      redraw();
    }

    return h(
      "form",
      { class: "v-signin-form", novalidate: true, onsubmit: submit },
      SB.ui.field("BYU email", input),
      h("span", { class: "field-hint v-signin-hint", id: "signin-hint" }, "Only @byu.edu addresses can sign in. We'll email you a one-time link, no password."),
      ui.error ? h("div", { class: "notice notice-error", role: "alert" }, ui.error) : null,
      h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Email me a sign-in link")
    );
  }

  function linkSent(h, redraw) {
    function open() {
      var r = SB.store.openLink(ui.sentTo);
      if (!r.ok) {
        ui.error = r.error;
        redraw();
        return;
      }
      // Signed in. The store change makes the router redraw and send the user on.
      ui.error = null;
      ui.sentTo = null;
      ui.draft = "";
      ui.route = null;
    }
    function back() {
      ui.sentTo = null;
      ui.error = null;
      redraw();
    }
    return h(
      "div",
      { class: "v-signin-sent" },
      h("div", { class: "v-signin-mail", "aria-hidden": "true" }, "✉"),
      h("h1", { class: "center" }, "Check your email"),
      h("p", { class: "center" }, "We sent a one-time sign-in link to"),
      h("p", { class: "center strong v-signin-addr" }, ui.sentTo),
      h("p", { class: "center muted small" }, "The link works once. In this prototype no email is sent; open it below."),
      ui.error ? h("div", { class: "notice notice-error", role: "alert" }, ui.error) : null,
      SB.ui.button("Open link (demo)", open, { kind: "primary", class: "btn-block" }),
      h("div", { class: "center mt" }, h("button", { type: "button", class: "btn-link", onclick: back }, "Use a different email"))
    );
  }

  function intro(h, course) {
    if (course) {
      return h(
        "div",
        { class: "v-signin-intro" },
        h("div", { class: "section-title" }, "You're joining"),
        h(
          "div",
          { class: "card highlight v-signin-course" },
          h("div", { class: "card-title" }, course.name),
          h("div", { class: "card-sub" }, "Section " + course.section)
        ),
        h("p", { class: "muted" }, "Find a study group for your next exam. Sign in with your BYU email to add this course.")
      );
    }
    return h(
      "div",
      { class: "v-signin-intro" },
      h("h1", null, "Sign in"),
      h("p", { class: "muted" }, "Study with classmates before your exams. Sign in with your BYU email.")
    );
  }

  function draw(mount, course, routeKey) {
    var h = SB.ui.h;
    function redraw() { draw(mount, course, routeKey); }
    mount.innerHTML = "";
    var body = ui.sentTo ? linkSent(h, redraw) : h("div", null, intro(h, course), emailForm(h, mount, redraw));
    mount.appendChild(h("div", { class: "v-signin" }, body));
    if (!ui.sentTo) {
      var el = mount.querySelector("#signin-email");
      if (el && ui.error) { try { el.focus(); } catch (e) { /* ignore */ } }
    }
  }

  function renderJoin(params, mount) {
    var state = SB.store.get();
    var course = courseForCode(state, params.linkCode);
    if (!course) {
      var h = SB.ui.h;
      mount.innerHTML = "";
      mount.appendChild(
        h("div", { class: "v-signin" }, SB.ui.card(h("h2", null, "This link isn't valid")))
      );
      return;
    }
    enter("join:" + params.linkCode);
    draw(mount, course, ui.route);
  }

  function renderSignin(params, mount) {
    var state = SB.store.get();
    enter("signin");
    var pending = state.demo && state.demo.pendingLinkCode;
    draw(mount, pending ? courseForCode(state, pending) : null, ui.route);
  }

  SB.router.register("/join/:linkCode", renderJoin);
  SB.router.register("/signin", renderSignin);
})();
