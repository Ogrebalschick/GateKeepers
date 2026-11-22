import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import {} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
export function ProtectedRoute({ children }) {
    const location = useLocation();
    const token = localStorage.getItem('guard_token');
    if (!token) {
        const redirectPath = encodeURIComponent(location.pathname + location.search);
        return _jsx(Navigate, { to: `/login?redirect=${redirectPath}`, replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
