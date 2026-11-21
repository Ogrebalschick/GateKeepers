import type { RiskLevel } from '../types';

interface Props {
  riskLevel: RiskLevel;
  size?: 'sm' | 'md';
}

const CONFIG: Record<RiskLevel, { label: string; className: string }> = {
  none: {
    label: 'Нет',
    className: 'bg-gray-100 text-gray-800',
  },
  low: {
    label: 'Низкий',
    className: 'bg-blue-100 text-blue-800',
  },
  medium: {
    label: 'Средний',
    className: 'bg-orange-100 text-orange-800',
  },
  high: {
    label: 'Высокий',
    className: 'bg-red-100 text-red-800',
  },
  critical: {
    label: 'Критический',
    className: 'bg-red-900 text-white font-bold',
  },
};

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'text-xs px-2 py-0.5 rounded',
  md: 'text-sm px-3 py-1 rounded-md font-medium',
};

export default function RiskBadge({ riskLevel, size = 'md' }: Props) {
  const { label, className } = CONFIG[riskLevel];
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className} ${SIZE[size]}`}>
      {label}
    </span>
  );
}
