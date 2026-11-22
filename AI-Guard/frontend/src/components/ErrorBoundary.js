import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from 'lucide-react';
import { Component } from 'react';
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900", children: _jsxs("div", { className: "max-w-md p-8 bg-white dark:bg-slate-800 rounded-lg shadow-lg", children: [_jsxs("h1", { className: "text-2xl font-bold text-red-600 mb-4 flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "w-6 h-6" }), "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A"] }), _jsx("p", { className: "text-gray-700 dark:text-gray-200 mb-4", children: "\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043D\u0435\u043F\u0440\u0435\u0434\u0432\u0438\u0434\u0435\u043D\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443." }), this.state.error && (_jsxs("details", { className: "mb-4", children: [_jsx("summary", { className: "cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700", children: "\u0414\u0435\u0442\u0430\u043B\u0438 \u043E\u0448\u0438\u0431\u043A\u0438" }), _jsx("pre", { className: "mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto", children: this.state.error.message })] })), _jsx("button", { type: "button", onClick: () => window.location.reload(), className: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors cursor-pointer", children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443" })] }) }));
        }
        return this.props.children;
    }
}
