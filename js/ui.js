/* js/ui.js — small DOM helpers. No business logic, no state access.
 *
 * SB.ui.h(tag, attrs, ...children)
 *   attrs: { class: "a b" | ["a", cond && "b"], style: "..." | {...}, dataset: {...},
 *            onclick: fn (any on* key adds a listener), value, checked, selected, disabled,
 *            any other key → attribute (true → empty attribute; null/false → skipped) }
 *   attrs may be left out: h("p", "text") works. Children may be strings, numbers, nodes,
 *   arrays, or null/false/undefined (skipped). Text is always set as text, never as HTML.
 * SB.ui.card(...children)                 → <div class="card">
 * SB.ui.button(label, onClick, { kind: "primary" | "secondary" | "danger", disabled, class })
 * SB.ui.empty(text)                       → <div class="empty">
 * SB.ui.field(label, input)               → <label class="field"><span class="field-label">…</span>input</label>
 */
(function () {
  var SB = (window.SB = window.SB || {});

  var PROPS = { value: 1, checked: 1, selected: 1, disabled: 1, htmlFor: 1, innerText: 0 };

  function isChild(x) {
    return (
      x == null || x === false || typeof x === "string" || typeof x === "number" ||
      Array.isArray(x) || (typeof Node !== "undefined" && x instanceof Node)
    );
  }

  function append(el, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(el, c); });
      return;
    }
    if (typeof Node !== "undefined" && child instanceof Node) {
      el.appendChild(child);
      return;
    }
    el.appendChild(document.createTextNode(String(child)));
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (isChild(attrs)) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class" || k === "className") {
          el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
        } else if (k === "style" && typeof v === "object") {
          Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
        } else if (k === "dataset" && typeof v === "object") {
          Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        } else if (k.slice(0, 2) === "on" && typeof v === "function") {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (PROPS[k]) {
          el[k] = v;
        } else if (v === true) {
          el.setAttribute(k, "");
        } else {
          el.setAttribute(k, String(v));
        }
      });
    }
    append(el, children);
    return el;
  }

  function card() {
    return h("div", { class: "card" }, Array.prototype.slice.call(arguments));
  }

  function button(label, onClick, opts) {
    opts = opts || {};
    var kind = opts.kind || "primary";
    return h(
      "button",
      {
        type: "button",
        class: ["btn", "btn-" + kind, opts.class],
        disabled: !!opts.disabled,
        onclick: function (e) {
          if (opts.disabled) return;
          if (typeof onClick === "function") onClick(e);
        }
      },
      label
    );
  }

  function empty(text) {
    return h("div", { class: "empty" }, text);
  }

  function field(label, input) {
    return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input);
  }

  SB.ui = { h: h, card: card, button: button, empty: empty, field: field };
})();
