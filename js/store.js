/* js/store.js — the only file that writes state. Loads, saves and resets state in localStorage
   (key "sb.state.v1"), and exposes every action. Each action reads "now" from SB.clock.now(), calls the
   matching rule in SB.rules, saves, then notifies subscribers. Actions return { ok: true } or
   { ok: false, error }. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});
  var KEY = "sb.state.v1";
  var state = null;
  var subs = [];

  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("Prepd: could not save state", e); }
  }
  function emit() {
    subs.slice().forEach(function (fn) {
      try { fn(state); } catch (e) { console.error("Prepd: subscriber failed", e); }
    });
  }
  function setState(next) {
    state = deepFreeze(next);
    save();
    emit();
  }

  function load() {
    var loaded = null;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // A saved state from an older data shape is dropped for the current seed.
        if (parsed && parsed.version === SB.seed.version && parsed.demo && parsed.settings) loaded = parsed;
      }
    } catch (e) { loaded = null; }
    state = deepFreeze(loaded || copy(SB.seed));
    if (!loaded) save();
    return state;
  }

  function get() {
    if (!state) load();
    return state;
  }

  function subscribe(fn) {
    subs.push(fn);
    return function unsubscribe() { subs = subs.filter(function (f) { return f !== fn; }); };
  }

  function reset() {
    setState(copy(SB.seed));
    return { ok: true };
  }

  function advance(newNow) {
    var cur = get();
    if (typeof newNow !== "string" || isNaN(SB.clock.toMs(newNow))) return { ok: false, error: "That isn't a valid time." };
    if (SB.clock.toMs(newNow) < SB.clock.toMs(cur.demo.now)) return { ok: false, error: "The clock only moves forward." };
    try {
      setState(SB.rules.tick(cur, newNow));
      return { ok: true };
    } catch (e) {
      console.error("Prepd: advance failed", e);
      return { ok: false, error: "Something went wrong moving the clock." };
    }
  }

  // Runs SB.rules[name](state, now, currentUserId, ...args).
  function run(name, args) {
    var cur = get();
    var fn = SB.rules && SB.rules[name];
    if (typeof fn !== "function") return { ok: false, error: "Unknown action: " + name };
    var r;
    try {
      r = fn.apply(null, [cur, SB.clock.now(), cur.demo.currentUserId].concat(args));
    } catch (e) {
      console.error("Prepd: action " + name + " failed", e);
      return { ok: false, error: "Something went wrong." };
    }
    if (r.error) return { ok: false, error: r.error };
    setState(r.state);
    return { ok: true };
  }
  function action(name) {
    return function () { return run(name, Array.prototype.slice.call(arguments)); };
  }

  var api = { load: load, get: get, subscribe: subscribe, reset: reset, advance: advance };
  [
    // demo panel
    "setLocation", "switchUser",
    // sign-in
    "setPendingLink", "requestLink", "openLink", "joinCourse", "signOut",
    // sign-up
    "saveProfile", "acceptConduct", "submitIntake", "finishPermissions",
    // student
    "addCourse", "pick", "unpick", "confirm", "cantMakeIt", "cancel", "checkIn", "report", "answerPost", "submitExit", "deleteAccount",
    // notifications
    "markRead",
    // admin
    "saveCourse", "saveExam", "saveSlot", "setPilotEnd", "decideCheckin", "decideReport", "removeMiss"
  ].forEach(function (name) { api[name] = action(name); });

  // requestLink only validates; it never changes state, so don't save or notify.
  api.requestLink = function (email) {
    var cur = get();
    var r = SB.rules.requestLink(cur, SB.clock.now(), cur.demo.currentUserId, email);
    return r.error ? { ok: false, error: r.error } : { ok: true };
  };

  SB.store = api;
})();
