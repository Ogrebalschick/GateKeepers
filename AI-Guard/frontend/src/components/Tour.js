import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
import { EVENTS, Joyride, STATUS } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { createAdminTourSteps, TOUR_COMPLETED_KEY, TOUR_PROMPTED_KEY } from '../tours/adminTour';
const TourContext = createContext(null);
export function useTour() {
    const value = useContext(TourContext);
    if (!value) {
        throw new Error('useTour должен вызываться внутри TourProvider');
    }
    return value;
}
export function TourProvider({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { role } = useCurrentUser();
    const [run, setRun] = useState(false);
    const [tourKey, setTourKey] = useState(0);
    const [showPrompt, setShowPrompt] = useState(false);
    const restarting = useRef(false);
    const originPath = useRef(location.pathname);
    const steps = useMemo(() => createAdminTourSteps(navigate, role), [navigate, role]);
    useEffect(() => {
        if (location.pathname === '/login')
            return;
        if (localStorage.getItem(TOUR_COMPLETED_KEY) || localStorage.getItem(TOUR_PROMPTED_KEY)) {
            return;
        }
        setShowPrompt(true);
    }, [location.pathname]);
    const finishTour = useCallback(() => {
        localStorage.setItem(TOUR_COMPLETED_KEY, '1');
        localStorage.setItem(TOUR_PROMPTED_KEY, '1');
        setRun(false);
        setShowPrompt(false);
        const back = originPath.current || '/';
        if (window.location.pathname !== back)
            navigate(back);
    }, [navigate]);
    const startTour = useCallback(() => {
        originPath.current = location.pathname;
        setShowPrompt(false);
        localStorage.setItem(TOUR_PROMPTED_KEY, '1');
        restarting.current = true;
        setRun(false);
        setTourKey((key) => key + 1);
        const wait = location.pathname === '/' ? 0 : 400;
        if (location.pathname !== '/')
            navigate('/');
        window.setTimeout(() => {
            setRun(true);
            window.setTimeout(() => {
                restarting.current = false;
            }, 50);
        }, wait);
    }, [location.pathname, navigate]);
    const onEvent = useCallback((data) => {
        if (restarting.current)
            return;
        if (data.type === EVENTS.TOUR_END ||
            data.status === STATUS.FINISHED ||
            data.status === STATUS.SKIPPED) {
            finishTour();
        }
    }, [finishTour]);
    return (_jsxs(TourContext.Provider, { value: { startTour, running: run }, children: [children, showPrompt && !run && location.pathname !== '/login' && (_jsx(WelcomePrompt, { onStart: startTour, onLater: () => {
                    localStorage.setItem(TOUR_PROMPTED_KEY, '1');
                    setShowPrompt(false);
                } })), _jsx(Joyride, { run: run, continuous: true, scrollToFirstStep: true, steps: steps, onEvent: onEvent, locale: {
                    back: 'Назад',
                    close: 'Закрыть',
                    last: 'Готово',
                    next: 'Далее',
                    skip: 'Пропустить',
                    nextWithProgress: 'Далее ({current} из {total})',
                }, options: {
                    backgroundColor: '#0f172a',
                    textColor: '#f8fafc',
                    primaryColor: '#2563eb',
                    arrowColor: '#0f172a',
                    overlayColor: 'rgba(2, 6, 23, 0.75)',
                    zIndex: 10000,
                    showProgress: true,
                    skipBeacon: true,
                    buttons: ['back', 'skip', 'primary'],
                    closeButtonAction: 'skip',
                    overlayClickAction: false,
                    spotlightRadius: 12,
                    spotlightPadding: 8,
                    blockTargetInteraction: true,
                }, styles: {
                    tooltip: { borderRadius: 12, padding: 16 },
                    tooltipTitle: { fontSize: 16, fontWeight: 700 },
                    tooltipContent: { fontSize: 14, lineHeight: 1.5, padding: '8px 0 0' },
                    buttonPrimary: { borderRadius: 8, fontSize: 14, padding: '8px 14px' },
                    buttonBack: { color: '#cbd5e1' },
                    buttonSkip: { color: '#94a3b8' },
                } }, tourKey)] }));
}
function WelcomePrompt({ onStart, onLater }) {
    return (_jsx("div", { className: "fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4", children: _jsxs("div", { className: "w-full max-w-md rounded-xl bg-slate-900 p-6 text-slate-50 shadow-xl", children: [_jsx("h2", { className: "text-lg font-bold", children: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 \u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436!" }), _jsx("p", { className: "mt-2 text-sm leading-relaxed text-slate-200", children: "\u042D\u0442\u043E \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u043E\u0432, \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C\u044B\u0445 \u043A \u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442\u0430\u043C. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0439\u0442\u0438 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435 \u043F\u043E \u043E\u0441\u043D\u043E\u0432\u043D\u044B\u043C \u044D\u043A\u0440\u0430\u043D\u0430\u043C." }), _jsxs("div", { className: "mt-5 flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: onLater, className: "px-3 py-2 text-sm text-slate-300 hover:text-white cursor-pointer", children: "\u041F\u043E\u0437\u0436\u0435" }), _jsx("button", { type: "button", onClick: onStart, className: "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer", children: "\u041D\u0430\u0447\u0430\u0442\u044C \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435" })] })] }) }));
}
