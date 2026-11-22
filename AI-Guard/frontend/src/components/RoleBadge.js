import { jsx as _jsx } from "react/jsx-runtime";
const STYLES = {
    admin: 'bg-red-100 text-red-800',
    sre: 'bg-blue-100 text-blue-800',
    developer: 'bg-gray-100 text-gray-800',
};
export function RoleBadge({ role }) {
    return (_jsx("span", { className: `inline-block px-2 py-0.5 text-xs font-medium rounded ${STYLES[role] || 'bg-gray-100 text-gray-800'}`, children: role || 'unknown' }));
}
