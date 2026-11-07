/* Pulido de interfaz: quita el emoji inicial de los títulos de sección y tarjeta (look más sobrio).
   No toca los emojis de los datos del usuario (íconos de bolsillos, categorías, etc.). */
(function () {
  var RE = /^[\s\u200d\ufe0f]*\p{Extended_Pictographic}[\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\p{Extended_Pictographic}]*\s*/u;
  var SEL = '.section-group-title, .card-title';
  var pending = false;

  function clean(root) {
    var nodes = (root.querySelectorAll ? root.querySelectorAll(SEL) : []);
    for (var i = 0; i < nodes.length; i++) {
      var first = nodes[i].firstChild;
      if (first && first.nodeType === 3 && RE.test(first.nodeValue)) {
        first.nodeValue = first.nodeValue.replace(RE, '');
      }
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; clean(document); });
  }
  function start() {
    clean(document);
    // Los títulos se vuelven a dibujar cuando cambian los datos: observar solo altas/bajas de nodos
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
