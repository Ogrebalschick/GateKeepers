import { jsx as _jsx } from "react/jsx-runtime";
const CONFIG = {
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
const SIZE = {
    sm: 'text-xs px-2 py-0.5 rounded',
    md: 'text-sm px-3 py-1 rounded-md font-medium',
};
export default function DecisionBadge({ decision, size = 'md' }) {
    const { label, className } = CONFIG[decision];
    return (_jsx("span", { className: `inline-flex items-center whitespace-nowrap ${className} ${SIZE[size]}`, children: label }));
}
