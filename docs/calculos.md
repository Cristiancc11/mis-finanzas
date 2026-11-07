# Cálculos de FinanzasPro — qué significa cada número

Las fórmulas viven en `src/core/finance.ts` (funciones puras) y se verifican con `npm test`.
La app antigua las usa a través de `window.FPCore`. Valores en pesos; "mes" = `AAAA-MM`.

## Mes en curso (lo que ya pasó)
| Número en pantalla | Fórmula |
|---|---|
| Total ahorrado | suma del saldo de todos los bolsillos |
| Patrimonio neto | ahorrado − saldo de tarjetas − deudas personales pendientes |
| Ingresos del mes | ingresos recurrentes del mes + ingresos extra + cashback |
| Gastos del mes | gastos del mes **sin** pagos de tarjeta (son transferencias internas) |
| Margen mensual | ingresos del mes − gastos del mes (hasta hoy) |
| Utilización de tarjetas | saldo de tarjetas ÷ cupo total (los préstamos personales NO cuentan) |

## Hacia adelante (proyecciones)
Usan referencias **estables**, no el gasto parcial del mes:

- **Gasto típico** = con historial: el mayor entre lo gastado este mes y el promedio de hasta 3 meses anteriores con gasto; sin historial: el mayor entre lo gastado y el presupuesto.
- **Ingreso típico** = ingresos recurrentes + cashback (los extras de una sola vez no se proyectan). Si todo es ocasional: promedio de hasta 3 meses anteriores.
- **Cubre X meses** = ahorrado ÷ gasto típico. **Fondo ideal** = gasto típico × 6.
- **Ingreso / gasto anual** = típico × 12. **Ahorro anual** = (ingreso típico − gasto típico) × 12. **Patrimonio en 12 meses** = patrimonio + ahorro anual.
- **Puntaje de salud**: 50 base ± reglas de cobertura, margen, ahorros vs. deuda, endeudamiento y número de bolsillos (ver `healthScore`).

## Rendimientos de ahorros (tasa E.A.)
- Anual bruto = ahorrado × tasa. Diario = anual ÷ 365.
- Retención del 7 % sobre el TOTAL si el rendimiento diario supera 0,055 UVT (UVT 2026 = $ 52.374). Confirmar con tu contador.
- Proyección: interés compuesto mensual con la tasa neta + aporte mensual (ingreso típico − gasto típico).

## Reglas de datos
- Un mes **pasado sin registros** vale 0 (no se rellena con ingresos recurrentes).
- El presupuesto de un mes nuevo **se copia del mes anterior** con valores (solo mes actual/futuros; una vez por mes).
- Gasto compartido en partes iguales: las partes suman **exactamente** el total (el sobrante de redondeo va a las primeras personas).
- Fecha de corte día 29/30/31 se ajusta al último día del mes (corte 31 en abril = 30 de abril).
- Al cargar, los números guardados como texto o `NaN` se corrigen (`sanitizeState`).
