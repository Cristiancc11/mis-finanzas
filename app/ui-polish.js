/* Pulido de interfaz: quita el emoji inicial de los títulos de sección y tarjeta (look más sobrio).
   No toca los emojis de los datos del usuario (íconos de bolsillos, categorías, etc.). */
(function () {
  var RE = /^[\s\u200d\ufe0f]*\p{Extended_Pictographic}[\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\p{Extended_Pictographic}]*\s*/u;
  var SEL = '.section-group-title, .card-title, .form-section-title, .big-modal-title, .field-label';
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
  // Resumen: "Resumen ejecutivo", rendimientos y estrategia de cashback pasan a un bloque plegado
  // (se mueven los mismos nodos, así que el código que los rellena por id sigue funcionando).
  function collapseAdvanced() {
    var sec = document.getElementById('section-resumen');
    var sum = document.getElementById('summary-content');
    if (!sec || !sum || sec.querySelector(':scope > .fp-more')) return;
    var start = sum.closest('.raised-card');
    if (!start || start.parentElement !== sec) return;
    var details = document.createElement('details');
    details.className = 'fp-more';
    var head = document.createElement('summary');
    head.innerHTML = '<span>Más detalle y herramientas<small>Resumen ejecutivo, rendimientos de tus ahorros y estrategia de cashback</small></span>';
    var body = document.createElement('div');
    body.className = 'fp-more-body';
    details.appendChild(head);
    details.appendChild(body);
    sec.insertBefore(details, start);
    var node = start;
    while (node) { var next = node.nextSibling; body.appendChild(node); node = next; }
  }

  // Pestañas Bolsillos, Ingresos, Tarjetas, Mis Deudas y Metas: el formulario de "Agregar…" pasaba por delante de la
  // lista de lo que el usuario ya tiene. Ahora el formulario queda plegado (un botón "+ Agregar…") y la lista va primero.
  function collapseForms() {
    var cards = document.querySelectorAll('.fin-section > .raised-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.dataset.fpForm) continue;
      var t = card.querySelector('.card-title');
      if (!t || !card.querySelector('input, select, textarea')) continue;
      var label = t.textContent.replace(/^[^\p{L}]+/u, '').trim();
      if (!/^(Agregar|Registrar|Nueva|Nuevo)\b/i.test(label)) continue;
      card.dataset.fpForm = '1';
      card.classList.add('fp-form-card');
      var d = document.createElement('details');
      d.className = 'fp-form';
      var s = document.createElement('summary');
      var plus = document.createElement('span'); plus.className = 'fp-form-plus'; plus.setAttribute('aria-hidden', 'true'); plus.textContent = '+';
      var txt = document.createElement('span'); txt.textContent = label;
      s.appendChild(plus); s.appendChild(txt);
      card.parentNode.insertBefore(d, card);
      d.appendChild(s); d.appendChild(card);
      var prev = d.previousElementSibling;   // título de grupo redundante ("Agregar una nueva tarjeta")
      if (prev && prev.classList.contains('section-group-title') && /agregar/i.test(prev.textContent)) prev.style.display = 'none';
    }
  }

  // Si el código antiguo enfoca o desplaza algo que está dentro de un formulario plegado, se abre solo.
  function openFormFor(el) {
    var d = el && el.closest && el.closest('details.fp-form:not([open])');
    if (d) d.open = true;
  }
  var nativeFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () { openFormFor(this); return nativeFocus.apply(this, arguments); };
  var nativeScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { openFormFor(this); return nativeScroll.apply(this, arguments); };

  // Accesibilidad: campos que solo tienen texto de ayuda (placeholder) y ninguna etiqueta reciben aria-label con ese texto,
  // para que un lector de pantalla sepa qué se pide. No cambia nada visual.
  function labelPlaceholders() {
    var fields = document.querySelectorAll('.fp-form-card input[placeholder], .fp-form-card textarea[placeholder], .big-modal-body input[placeholder]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.getAttribute('aria-label') || f.closest('label')) continue;
      if (f.id && document.querySelector('label[for="' + f.id + '"]')) continue;
      f.setAttribute('aria-label', f.getAttribute('placeholder'));
    }
  }

  function start() {
    collapseAdvanced();
    clean(document);
    collapseForms();
    labelPlaceholders();
    // Los títulos se vuelven a dibujar cuando cambian los datos: observar solo altas/bajas de nodos
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
