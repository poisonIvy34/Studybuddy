/* js/router.js — hash routes, guards, and the student and admin tab bars.
 *
 * SB.router.register(pattern, renderFn)  pattern like "/session/:id"; renderFn(params, mountEl)
 * SB.router.go(hash)                     "#/exams" or "/exams"
 * SB.router.render()                     redraw the current route (safe to call re-entrantly)
 * SB.router.start()                      listen for hashchange and draw the first screen
 *
 * Guards (CLAUDE.md "How the app is navigated"):
 *  - No current user: only #/signin and #/join/:code render; anything else → #/signin.
 *    Opening #/join/<valid code> stores it with SB.store.setPendingLink.
 *  - Student on #/join/<valid code>: SB.store.joinCourse(code), then → home (sign-up guard applies).
 *    An unknown code renders the join view (it shows "This link isn't valid").
 *  - Sign-up not finished → #/onboarding/<first unfinished step>. Earlier steps may be revisited.
 *  - Admin on a non-admin route → #/admin/courses. Student on an admin route → #/exams.
 *  - Unknown route → the user's home.
 * Signed-up students also get a check-in bar under the top bar while any of their seats can check in.
 * A known route with no registered view shows a "Not built yet" card.
 */
(function () {
  var SB = (window.SB = window.SB || {});
  var ui = function () { return SB.ui; };

  var STEPS = ["profile", "conduct", "intake", "permissions"];
  var STUDENT_HOME = "/exams";
  var ADMIN_HOME = "/admin/courses";

  // Every route in the spec, so guards and "Not built yet" work before views exist.
  var KNOWN = [
    "/join/:linkCode", "/signin",
    "/onboarding/profile", "/onboarding/conduct", "/onboarding/intake", "/onboarding/permissions",
    "/exams", "/session/:id", "/after/:id", "/me", "/classes", "/survey/exit",
    "/admin/courses", "/admin/slot/:id", "/admin/review", "/admin/misses", "/admin/metrics"
  ];

  var routes = []; // { pattern, parts, fn }
  var rendering = false;
  var again = false;
  var lastPath = null;
  var started = false;

  function split(path) {
    return path.split("/").filter(function (p) { return p !== ""; });
  }

  function matchPattern(pattern, path) {
    var pp = split(pattern);
    var xp = split(path);
    if (pp.length !== xp.length) return null;
    var params = {};
    for (var i = 0; i < pp.length; i++) {
      if (pp[i].charAt(0) === ":") {
        try { params[pp[i].slice(1)] = decodeURIComponent(xp[i]); }
        catch (e) { params[pp[i].slice(1)] = xp[i]; }
      } else if (pp[i] !== xp[i]) {
        return null;
      }
    }
    return params;
  }

  function findRegistered(path) {
    for (var i = 0; i < routes.length; i++) {
      var params = matchPattern(routes[i].pattern, path);
      if (params) return { route: routes[i], params: params };
    }
    return null;
  }

  function isKnown(path) {
    if (KNOWN.some(function (p) { return matchPattern(p, path); })) return true;
    // A registered route counts as known, except onboarding steps outside the four names.
    var f = findRegistered(path);
    if (!f) return false;
    if (path.indexOf("/onboarding/") === 0) return STEPS.indexOf(split(path)[1]) !== -1;
    return true;
  }

  function normalize(hash) {
    var p = String(hash || "");
    if (p.charAt(0) === "#") p = p.slice(1);
    var q = p.indexOf("?");
    if (q !== -1) p = p.slice(0, q);
    if (p.charAt(0) !== "/") p = "/" + p;
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p;
  }

  function currentPath() {
    return normalize(window.location.hash);
  }

  function getState() {
    return SB.store && SB.store.get ? SB.store.get() : null;
  }

  function currentUser(state) {
    if (!state || !state.demo) return { kind: "none" };
    var id = state.demo.currentUserId;
    if (!id) return { kind: "none" };
    var admin = (state.admins || []).find(function (a) { return a.id === id; });
    if (admin) return { kind: "admin", user: admin };
    var student = (state.students || []).find(function (s) { return s.id === id; });
    if (student) return { kind: "student", user: student };
    return { kind: "none" };
  }

  function firstUnfinishedStep(student) {
    var ob = student.onboarding || {};
    for (var i = 0; i < STEPS.length; i++) if (!ob[STEPS[i]]) return STEPS[i];
    return null;
  }

  function courseForCode(state, code) {
    return (state.courses || []).find(function (c) { return c.linkCode === code; }) || null;
  }

  // Returns the path to show. May call store actions (setPendingLink, joinCourse).
  function resolve(path, state) {
    var who = currentUser(state);
    var join = matchPattern("/join/:linkCode", path);

    if (who.kind === "none") {
      if (join) {
        var c = courseForCode(state, join.linkCode);
        if (c && state.demo.pendingLinkCode !== join.linkCode) SB.store.setPendingLink(join.linkCode);
        return path;
      }
      if (path === "/signin") return path;
      return "/signin";
    }

    if (who.kind === "admin") {
      if (path.indexOf("/admin/") === 0 && isKnown(path)) return path;
      return ADMIN_HOME;
    }

    // Student
    var student = who.user;
    if (join) {
      if (!courseForCode(state, join.linkCode)) return path; // view shows "This link isn't valid"
      if ((student.courseIds || []).indexOf(courseForCode(state, join.linkCode).id) === -1) {
        SB.store.joinCourse(join.linkCode);
      }
      return STUDENT_HOME; // re-resolved: the sign-up guard applies next
    }

    var step = firstUnfinishedStep(student);
    if (step) {
      var m = matchPattern("/onboarding/:step", path);
      if (m && STEPS.indexOf(m.step) !== -1 && STEPS.indexOf(m.step) <= STEPS.indexOf(step)) return path;
      return "/onboarding/" + step;
    }

    if (path.indexOf("/admin/") === 0 || path === "/admin") return STUDENT_HOME;
    if (path.indexOf("/onboarding/") === 0 || path === "/signin") return STUDENT_HOME;
    if (!isKnown(path)) return STUDENT_HOME;
    return path;
  }

  function tabBar(items, path, className) {
    var h = ui().h;
    return h(
      "nav",
      { class: className },
      items.map(function (t) {
        var active = t.match.some(function (prefix) {
          return path === prefix || path.indexOf(prefix + "/") === 0;
        });
        return h(
          "a",
          { class: ["tab", active && "active"], href: "#" + t.path, "aria-current": active ? "page" : null },
          t.label
        );
      })
    );
  }

  var STUDENT_TABS = [
    { label: "Exams", path: "/exams", match: ["/exams", "/session", "/after"] },
    { label: "Me", path: "/me", match: ["/me", "/classes", "/survey"] }
  ];
  var ADMIN_TABS = [
    { label: "Courses", path: "/admin/courses", match: ["/admin/courses", "/admin/slot"] },
    { label: "Review", path: "/admin/review", match: ["/admin/review"] },
    { label: "Misses", path: "/admin/misses", match: ["/admin/misses"] },
    { label: "Metrics", path: "/admin/metrics", match: ["/admin/metrics"] }
  ];

  function brand() {
    var h = ui().h;
    return h("span", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "P"), "Prepd");
  }

  // The check-in bar: one per seat whose I'm here is open right now (SB.rules.seatActions decides).
  // Tapping it checks in and opens that session, where the result is shown.
  var checkinError = null; // { seatId, text } from the last failed tap

  function checkinBars(state, studentId) {
    var h = ui().h;
    var now = SB.clock.now();
    return state.seats
      .filter(function (seat) {
        return seat.studentId === studentId && SB.rules.seatActions(state, now, seat.id).canCheckIn;
      })
      .map(function (seat) {
        var session = state.sessions.find(function (x) { return x.id === seat.sessionId; });
        var slot = session && state.slots.find(function (x) { return x.id === session.slotId; });
        if (!slot) return null;
        var started = SB.clock.toMs(now) >= SB.clock.toMs(slot.start);
        var spot = session.spot && session.spot !== "To be announced" ? " · " + session.spot : "";
        var err = checkinError && checkinError.seatId === seat.id ? checkinError.text : null;
        return h("div", { class: "checkin-bar", role: "region", "aria-label": "Check in" },
          h("span", { class: "checkin-pulse", "aria-hidden": "true" }),
          h("div", { class: "checkin-text" },
            h("div", { class: "checkin-title" },
              (started ? "Session started " : "Session starts ") + SB.clock.fmt(slot.start, "time")),
            h("div", { class: "checkin-sub" }, "At the spot? " + slot.place + spot),
            err ? h("div", { class: "checkin-error", role: "alert" }, err) : null),
          ui().button("I'm here", function () {
            var r = SB.store.checkIn(seat.id);
            checkinError = r.ok ? null : { seatId: seat.id, text: r.error };
            if (r.ok) go("#/session/" + session.id); else render();
          }, { kind: "primary", class: "checkin-btn" }));
      })
      .filter(Boolean);
  }

  function setMode(mode) {
    var b = document.body;
    b.classList.remove("mode-student", "mode-admin");
    b.classList.add(mode === "admin" ? "mode-admin" : "mode-student");
  }

  function draw(path, state) {
    var h = ui().h;
    var app = document.getElementById("app");
    if (!app) return;
    var who = currentUser(state);
    var view = h("main", { class: "view", id: "view" });
    var shell;

    if (who.kind === "admin") {
      setMode("admin");
      shell = h(
        "div",
        { class: "shell shell-admin" },
        h(
          "header",
          { class: "admin-top" },
          h("div", { class: "admin-brand" }, brand(), h("span", { class: "muted small" }, "Admin · " + who.user.name)),
          tabBar(ADMIN_TABS, path, "admin-tabs")
        ),
        view
      );
    } else {
      setMode("student");
      var showTabs = who.kind === "student" && !firstUnfinishedStep(who.user);
      shell = h(
        "div",
        { class: "shell shell-student" },
        h("header", { class: "topbar" }, brand()),
        showTabs ? checkinBars(state, who.user.id) : null,
        view,
        showTabs ? tabBar(STUDENT_TABS, path, "tabbar") : null
      );
    }

    app.innerHTML = "";
    app.appendChild(shell);

    var found = findRegistered(path);
    if (found) {
      try {
        found.route.fn(found.params, view);
      } catch (err) {
        view.innerHTML = "";
        view.appendChild(ui().card(h("h2", null, "Something went wrong"), h("p", { class: "muted" }, String(err && err.message || err))));
        if (window.console) console.error(err);
      }
    } else {
      view.appendChild(
        ui().card(
          h("h2", null, "Not built yet"),
          h("p", { class: "muted" }, "The screen for #" + path + " hasn't been built yet.")
        )
      );
    }
  }

  function renderOnce() {
    var state = getState();
    var path = currentPath();
    var target = path;
    for (var i = 0; i < 5; i++) {
      var next = resolve(target, getState());
      if (next === target) break;
      target = next;
    }
    if (target !== path) {
      try { window.location.replace("#" + target); }
      catch (e) { window.location.hash = "#" + target; }
    }
    state = getState();
    if (target !== lastPath) {
      try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    }
    lastPath = target;
    draw(target, state);
  }

  function render() {
    if (rendering) { again = true; return; }
    rendering = true;
    try {
      var n = 0;
      do {
        again = false;
        renderOnce();
      } while (again && ++n < 5);
    } finally {
      rendering = false;
    }
  }

  function go(hash) {
    var target = "#" + normalize(hash);
    if (window.location.hash !== target) window.location.hash = target;
    render(); // draw now; the later hashchange sees lastPath and skips
  }

  function register(pattern, fn) {
    var p = normalize(pattern);
    routes = routes.filter(function (r) { return r.pattern !== p; });
    routes.push({ pattern: p, fn: fn });
  }

  function start() {
    if (!started) {
      started = true;
      window.addEventListener("hashchange", function () {
        if (currentPath() === lastPath) return; // our own redirect; already drawn
        render();
      });
    }
    render();
  }

  SB.router = { register: register, go: go, render: render, start: start };
})();
