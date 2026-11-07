/* Carga bajo demanda de librerías pesadas (solo se descargan cuando el usuario las usa).
   Las rutas /vendor/... las reescribe scripts/build.mjs con el hash del archivo. */
(function () {
  var cache = {};
  function loadScript(src) {
    if (!cache[src]) {
      cache[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { delete cache[src]; reject(new Error('No se pudo cargar ' + src + '. Revisa tu conexión e inténtalo de nuevo.')); };
        document.head.appendChild(s);
      });
    }
    return cache[src];
  }

  var FP = (window.FP = window.FP || {});
  FP.pdfjsBase = '/vendor/pdfjs/';

  // Excel (importar extractos .xlsx / .xls)
  FP.ensureXLSX = function () {
    return window.XLSX ? Promise.resolve() : loadScript('/vendor/xlsx.js');
  };

  // Generación de reportes PDF (jsPDF + autoTable)
  FP.ensureJsPDF = function () {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return loadScript('/vendor/jspdf.js').then(function () { return loadScript('/vendor/jspdf-autotable.js'); });
  };

  // Lectura de extractos PDF (pdf.js, módulo ES)
  FP.ensurePdfJs = function () {
    if (window.pdfjsLib) return Promise.resolve();
    return import('/vendor/pdf.mjs').then(function (mod) {
      mod.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
      window.pdfjsLib = mod;
    });
  };
})();
