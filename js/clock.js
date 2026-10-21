/* js/clock.js — the demo "now" and all time math and formatting in Mountain Time.
   Classic script. Everything lives on window.SB.clock. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});
  var TZ = "America/Denver";

  var partsFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Wall-clock parts of an instant in MT.
  function localParts(ms) {
    var out = {};
    partsFmt.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
    });
    if (out.hour === 24) out.hour = 0;
    return out; // { year, month (1-12), day, hour, minute, second }
  }

  // MT offset in minutes at an instant, e.g. -420 for MST.
  function offsetMin(ms) {
    var p = localParts(ms);
    var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }

  // Instant for an MT wall-clock time.
  function localToMs(y, mo, d, h, mi, s) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    var ms = guess - offsetMin(guess) * 60000;
    ms = guess - offsetMin(ms) * 60000;
    return ms;
  }

  function toMs(iso) { return Date.parse(iso); }

  function fromMs(ms) {
    var p = localParts(ms);
    var off = offsetMin(ms);
    var sign = off < 0 ? "-" : "+";
    var a = Math.abs(off);
    return p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour) + ":" + pad(p.minute) + ":" +
      pad(p.second) + sign + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }

  // minutes and hours are elapsed time; days are MT calendar days (same wall-clock time).
  function add(iso, delta) {
    delta = delta || {};
    var ms = toMs(iso);
    if (delta.days) {
      var p = localParts(ms);
      ms = localToMs(p.year, p.month, p.day + delta.days, p.hour, p.minute, p.second);
    }
    ms += (delta.hours || 0) * 3600000 + (delta.minutes || 0) * 60000;
    return fromMs(ms);
  }

  function now() {
    if (SB.store && typeof SB.store.get === "function") return SB.store.get().demo.now;
    return SB.seed ? SB.seed.demo.now : null;
  }

  function timeStr(p) {
    var h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    return h12 + ":" + pad(p.minute) + " " + (p.hour < 12 ? "AM" : "PM");
  }

  function fmt(iso, kind) {
    if (!iso) return "";
    var ms = toMs(iso);
    var p = localParts(ms);
    var wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    var day = WEEKDAYS[wd] + ", " + MONTHS[p.month - 1] + " " + p.day;
    switch (kind) {
      case "time": return timeStr(p);
      case "day": return day;
      case "full": return WEEKDAYS_LONG[wd] + ", " + MONTHS_LONG[p.month - 1] + " " + p.day + ", " + p.year +
        " · " + timeStr(p) + " MT";
      case "dayTime":
      default: return day + " · " + timeStr(p);
    }
  }

  SB.clock = { now: now, toMs: toMs, fromMs: fromMs, add: add, fmt: fmt };
})();
