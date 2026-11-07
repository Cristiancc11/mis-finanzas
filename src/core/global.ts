// Expone el núcleo de cálculos a la app antigua (app.js) como window.FPCore.
import * as core from './finance';
(window as unknown as { FPCore: typeof core }).FPCore = core;
