/* js/notify.js — draws notifications as in-app banners into #banners.
 *
 * SB.notify.render()
 *  - Shows the current user's unread notifications, newest first, at most 3.
 *  - Admins see notifications addressed to "admin" (one shared read flag).
 *  - Tapping a banner marks it read (SB.store.markRead) and goes to its route.
 *  - The × button marks it read without moving.
 * Notification records are created by rules.js; this file only draws them.
 */
(function () {
  var SB = (window.SB = window.SB || {});
  var MAX = 3;

  function idNum(id) {
    var m = /(\d+)$/.exec(String(id || ""));
    return m ? Number(m[1]) : -1;
  }

  function recipient(state) {
    var id = state && state.demo && state.demo.currentUserId;
    if (!id) return null;
    if ((state.admins || []).some(function (a) { return a.id === id; })) return "admin";
    if ((state.students || []).some(function (s) { return s.id === id; })) return id;
    return null;
  }

  function unreadFor(state, to) {
    return (state.notifications || [])
      .filter(function (n) { return n.to === to && !n.read; })
      .sort(function (a, b) {
        var d = SB.clock.toMs(b.at) - SB.clock.toMs(a.at);
        if (d !== 0) return d;
        var x = idNum(b.id) - idNum(a.id);
        if (x !== 0) return x;
        return String(b.id) < String(a.id) ? -1 : 1;
      });
  }

  function render() {
    var mount = document.getElementById("banners");
    if (!mount) return;
    mount.innerHTML = "";
    var state = SB.store && SB.store.get ? SB.store.get() : null;
    var to = recipient(state);
    if (!to) return;
    var h = SB.ui.h;

    unreadFor(state, to).slice(0, MAX).forEach(function (n) {
      function open() {
        SB.store.markRead(n.id);
        if (n.route) SB.router.go(n.route);
      }
      var el = h(
        "div",
        {
          class: ["banner", "banner-" + n.kind],
          role: "button",
          tabindex: "0",
          dataset: { id: n.id },
          onclick: open,
          onkeydown: function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
          }
        },
        h(
          "div",
          { class: "banner-body" },
          h("div", { class: "banner-text" }, n.text),
          h("div", { class: "banner-time" }, SB.clock.fmt(n.at, "dayTime"), h("span", { class: "banner-cta" }, "Tap to open ›"))
        ),
        h(
          "button",
          {
            type: "button",
            class: "banner-close",
            "aria-label": "Dismiss",
            onclick: function (e) {
              e.stopPropagation();
              SB.store.markRead(n.id);
            }
          },
          "×"
        )
      );
      mount.appendChild(el);
    });
  }

  SB.notify = { render: render };
})();
