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

## Compras a cuotas
- Cuota (sistema francés, tasa **mensual**): `P·r·(1+r)^n / ((1+r)^n − 1)`; sin interés: `P / n`.
- Las cuotas son enteros y la **última absorbe el redondeo**: sin interés suman exactamente lo comprado (100.000 en 3 → 33.333 + 33.333 + 33.334).
- El cupo de la tarjeta se ocupa con el **capital** comprado (no con los intereses). Al borrar todo el grupo, el saldo vuelve exacto.
- "Capital bloqueado" (lo que no puedes liberar pagando antes del corte) = valor presente de las cuotas que faltan **después de la de este mes**. Con interés es menor que la suma de esas cuotas, porque esa suma incluye intereses que nunca estuvieron en el saldo.

## Editar un movimiento
- Se revierte el efecto del gasto original y se aplica el nuevo. El saldo de la tarjeta se recorta en cero **una sola vez, al final** (si ya pagaste parte de la tarjeta, editar una compra no sube el saldo).
- En un gasto compartido, lo que cada persona **ya pagó** (pago completo o abonos) se descuenta al recrear las deudas: solo se cobra lo que falta.

## Cupo de la tarjeta y compras a cuotas (v118)
- **Usado = saldo de la tarjeta.** Se descompone en *capital bloqueado por cuotas futuras* + *optimizable* (lo que sí puedes pagar para bajar la utilización). **Libre = cupo − saldo.**
- El capital bloqueado **nunca se muestra mayor que el saldo**: la barra siempre suma como máximo el 100 % del cupo.
- Si el capital que falta según el **calendario** de tus cuotas es **mayor que el saldo de la tarjeta**, NO es un error del saldo: es lo normal cuando adelantaste pagos a capital en tu banco. La app usa como verdad el saldo del banco; el calendario es solo una referencia. Se informa cuánto capital ya se adelantó (calendario − saldo).
- **Interruptor por tarjeta "Mi banco me deja adelantar el pago de mis cuotas"** (`canPrepayInstallments`): si está activo, el capital de las cuotas futuras **no se considera bloqueado**; todo el saldo es optimizable y el pago recomendado antes del corte es `saldo − objetivo de utilización`. Si está apagado (por defecto), se asume que las cuotas futuras no se pueden pagar antes.
- "Por pagar" de cada compra = suma de sus cuotas pendientes (**incluye intereses**); "capital" = lo que falta de principal. Pueden diferir, y el "por pagar" puede ser mayor que el saldo sin que haya error.
- Una compra cuyas cuotas ya pasaron todas está **terminada**: sale de la lista de activas ("Ya terminaste de pagar: …"), no bloquea cupo y su contador nunca pasa del total (antes "Cuota 5/4").

## Presupuesto (pantalla en React)
- KPIs: **Ingreso del mes** = recurrentes + extras + cashback; **Presupuesto total** = suma de los límites; **Gastado hasta hoy** = gasto de las categorías (sin pagos de tarjeta); **Margen real** = ingreso − gastado ("Si gastas todo" = ingreso − presupuesto).
- Cada categoría: `% usado = gastado ÷ presupuesto`. Estados: **excedida** (≥ 100 %), **cerca del límite** (≥ 80 %), **bajo control** (< 80 %) y **solo seguimiento** (sin límite). Se ordenan por urgencia y, dentro de cada grupo, por % real.
- Gastar **exactamente** el presupuesto cuenta como excedida y se muestra "Llegaste al límite" (antes: "Excediste $ 0").
- Las categorías sin presupuesto y sin gasto se pliegan detrás de un botón.

## Movimientos del mes (lista en React)
- **Orden:** fecha descendente; si empatan, el de creación (o id) más reciente arriba.
- **Qué se muestra:** sin rango de fechas, solo el mes que estás viendo; **con rango de fechas, todo el histórico**.
- **Filtros** (se combinan con "y"): texto en la descripción (sin importar mayúsculas), categorías, tarjeta, bolsillo, fechas, monto mínimo/máximo, solo con cashback y método de pago.
- **Filtros activos:** el rango de fechas cuenta como 1 y el de montos como 1. Un texto de solo espacios no cuenta.
- **Estadísticas** con filtros activos: cantidad de resultados, suma de montos y cashback.
- **Páginas de 10**; se muestran primera, anterior, actual, siguiente y última, con "…" en los saltos.
- **Editar y borrar** usan el mes real del movimiento (antes usaban el mes visible y fallaban con movimientos de otro mes al filtrar por fechas).

## Análisis y Conversor (gráficas en React, sin Chart.js)
- **Ingresos vs gastos**: últimos 6 meses; los pagos de tarjeta no cuentan como gasto.
- **Tasa de ahorro** del mes = (ingresos − gastos) ÷ ingresos, en % entero. Sin ingresos no hay tasa (no se dibuja el punto); gastar más de lo que entra da una tasa **negativa**.
- **Gasto por categoría**: del mes calendario actual, sin pagos de tarjeta, de mayor a menor. Una categoría desconocida se muestra con su nombre.
- **Historial del dólar**: los últimos 7, 30 o 90 días guardados. **Señal**: si la TRM de hoy está **≥ 1,5 % por debajo** del promedio del período → "buen momento para comprar"; **≥ 1,5 % por encima** → "buen momento para vender"; en medio → "en su promedio habitual". Es información histórica, no una predicción.

## Análisis: comparativa, gastos hormiga y calendario (en React)
- **Comparativa vs mes anterior**: por defecto compara el **mismo período** (del 1 al día de hoy en ambos meses) para comparar lo mismo con lo mismo; el botón "Mes completo" compara el mes anterior entero. **No incluye pagos de tarjeta** (antes los sumaba como gasto y aparecían como categoría). `%` por categoría = (ahora − antes) ÷ antes; sube/baja si el cambio supera el 10 %; sin gasto anterior se marca "nuevo".
- **Gastos hormiga**: gastos de **≤ 50.000** que se repiten (2 o más veces) con las mismas dos primeras palabras de la descripción. **No cuentan** los pagos de tarjeta ni las cuotas de compras a plazos. Proyección anual = total ÷ meses distintos en que aparece × 12. Función Pro.
- **Calendario**: cortes de tarjeta y recordatorios (únicos, mensuales desde el mes en que empiezan, anuales). Un día que no existe ese mes (29, 30 o 31) cae en el último día del mes. Los textos se muestran como texto, no como HTML.
