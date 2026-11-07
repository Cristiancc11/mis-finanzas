import { useFP } from './fp';
import { PocketsDonut } from './PocketsDonut';
import { IncomeExpenseBars } from './IncomeExpenseBars';
import { CategoryBars } from './CategoryBars';
import { GoalsList } from './GoalsList';

/** Gráficas del Resumen (primera pantalla migrada a React). */
export function ResumenCharts() {
  const snap = useFP();
  return (
    <div className="fp-charts">
      <div className="fp-col-left">
        <PocketsDonut snap={snap} />
        <GoalsList snap={snap} />
      </div>
      <div className="fp-col-right">
        <IncomeExpenseBars snap={snap} />
        <CategoryBars snap={snap} />
      </div>
    </div>
  );
}
