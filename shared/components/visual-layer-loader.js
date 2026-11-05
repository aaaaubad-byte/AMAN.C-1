/* AMAN.C visual layer v6 loader: stylesheet + icon/carousel behavior.
   theme.js runs in <head> before app.css is parsed, so the layer is attached once the head is complete
   (the moment <body> is created, before first paint of its content) to guarantee it follows app.css. */
(() => {
  "use strict";
  const current = document.currentScript;
  if (!current || !current.src || document.querySelector("link[data-aman-visual-v6]")) return;
  const cssUrl = new URL("../styles/visual-layer.css", current.src).href;
  const jsUrl = new URL("./visual-layer.js", current.src).href;
  let done = false;
  function attach() {
    if (done || !document.head) return;
    done = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    link.setAttribute("data-aman-visual-v6", "");
    document.head.append(link);
    const script = document.createElement("script");
    script.src = jsUrl;
    script.async = false;
    document.head.append(script);
  }
  if (document.body) attach();
  else {
    const watcher = new MutationObserver(() => { if (document.body) { watcher.disconnect(); attach(); } });
    watcher.observe(document.documentElement, { childList: true });
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  }
})();
