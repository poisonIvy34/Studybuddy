/* js/main.js — startup: load the store, subscribe the screens, start the router. */
(function () {
  var SB = (window.SB = window.SB || {});

  function drawAll() {
    SB.router.render();
    SB.notify.render();
    SB.demo.render();
  }

  SB.store.load();
  SB.store.subscribe(drawAll);
  SB.router.start(); // draws the first screen
  SB.notify.render();
  SB.demo.render();
})();
