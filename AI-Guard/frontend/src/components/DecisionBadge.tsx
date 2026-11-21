import type { Decision } from '../types';

interface Props {
  decision: Decision;
  size?: 'sm' | 'md';
}

const CONFIG: Record<Decision, { label: string; className: string }> = {
  allow: {
    label: 'Разрешено',
    className: 'bg-green-100 text-green-800 border border-green-200',
  },
  confirm: {
    label: 'Подтвердить',
    className: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  },
  block: {
    label: 'Заблокировано',
    className: 'bg-red-100 text-red-800 border border-red-200',
  },
};

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'text-xs px-2 py-0.5 rounded',
  md: 'text-sm px-3 py-1 rounded-md font-medium',
};

export default function DecisionBadge({ decision, size = 'md' }: Props) {
  const { label, className } = CONFIG[decision];
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className} ${SIZE[size]}`}>
      {label}
    </span>
  );
}
