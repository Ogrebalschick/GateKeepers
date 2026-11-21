import { RotateCcw } from 'lucide-react';
import type { Decision, RiskLevel } from '../types';

export interface LogFilterValues {
  decision: Decision | '';
  risk_level: RiskLevel | '';
  search: string;
  date_from: string;
  date_to: string;
}

interface Props {
  values: LogFilterValues;
  onChange: (patch: Partial<LogFilterValues>) => void;
  onReset: () => void;
}

const fieldClass =
  'px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export default function LogFilters({ values, onChange, onReset }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        Решение
        <select
          className={`${fieldClass} cursor-pointer`}
          value={values.decision}
          onChange={(e) => onChange({ decision: e.target.value as Decision | '' })}
        >
          <option value="">Все</option>
          <option value="allow">Разрешено</option>
          <option value="confirm">Подтвердить</option>
          <option value="block">Заблокировано</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        Уровень риска
        <select
          className={`${fieldClass} cursor-pointer`}
          value={values.risk_level}
          onChange={(e) => onChange({ risk_level: e.target.value as RiskLevel | '' })}
        >
          <option value="">Все</option>
          <option value="none">Нет</option>
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
          <option value="critical">Критический</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 min-w-48 flex-1">
        Поиск
        <input
          className={fieldClass}
          placeholder="Текст запроса"
          value={values.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        Дата от
        <input
          type="date"
          className={`${fieldClass} cursor-pointer`}
          value={values.date_from}
          onChange={(e) => onChange({ date_from: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
        Дата до
        <input
          type="date"
          className={`${fieldClass} cursor-pointer`}
          value={values.date_to}
          onChange={(e) => onChange({ date_to: e.target.value })}
        />
      </label>

      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
      >
        <RotateCcw className="w-4 h-4" />
        Сбросить
      </button>
    </div>
  );
}
