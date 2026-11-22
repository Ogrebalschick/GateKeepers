import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { EVENTS, Joyride, STATUS } from 'react-joyride';
import type { EventHandler } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { createAdminTourSteps, TOUR_COMPLETED_KEY, TOUR_PROMPTED_KEY } from '../tours/adminTour';

interface TourContextValue {
  startTour: () => void;
  running: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const value = useContext(TourContext);
  if (!value) {
    throw new Error('useTour должен вызываться внутри TourProvider');
  }
  return value;
}

export function TourProvider({ children }: { children: ReactNode }) {
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
    if (location.pathname === '/login') return;
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
    if (window.location.pathname !== back) navigate(back);
  }, [navigate]);

  const startTour = useCallback(() => {
    originPath.current = location.pathname;
    setShowPrompt(false);
    localStorage.setItem(TOUR_PROMPTED_KEY, '1');
    restarting.current = true;
    setRun(false);
    setTourKey((key) => key + 1);
    const wait = location.pathname === '/' ? 0 : 400;
    if (location.pathname !== '/') navigate('/');
    window.setTimeout(() => {
      setRun(true);
      window.setTimeout(() => {
        restarting.current = false;
      }, 50);
    }, wait);
  }, [location.pathname, navigate]);

  const onEvent = useCallback<EventHandler>(
    (data) => {
      if (restarting.current) return;
      if (
        data.type === EVENTS.TOUR_END ||
        data.status === STATUS.FINISHED ||
        data.status === STATUS.SKIPPED
      ) {
        finishTour();
      }
    },
    [finishTour],
  );

  return (
    <TourContext.Provider value={{ startTour, running: run }}>
      {children}
      {showPrompt && !run && location.pathname !== '/login' && (
        <WelcomePrompt
          onStart={startTour}
          onLater={() => {
            localStorage.setItem(TOUR_PROMPTED_KEY, '1');
            setShowPrompt(false);
          }}
        />
      )}
      <Joyride
        key={tourKey}
        run={run}
        continuous
        scrollToFirstStep
        steps={steps}
        onEvent={onEvent}
        locale={{
          back: 'Назад',
          close: 'Закрыть',
          last: 'Готово',
          next: 'Далее',
          skip: 'Пропустить',
          nextWithProgress: 'Далее ({current} из {total})',
        }}
        options={{
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
        }}
        styles={{
          tooltip: { borderRadius: 12, padding: 16 },
          tooltipTitle: { fontSize: 16, fontWeight: 700 },
          tooltipContent: { fontSize: 14, lineHeight: 1.5, padding: '8px 0 0' },
          buttonPrimary: { borderRadius: 8, fontSize: 14, padding: '8px 14px' },
          buttonBack: { color: '#cbd5e1' },
          buttonSkip: { color: '#94a3b8' },
        }}
      />
    </TourContext.Provider>
  );
}

function WelcomePrompt({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-slate-900 p-6 text-slate-50 shadow-xl">
        <h2 className="text-lg font-bold">Добро пожаловать в ИИ-Сторож!</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">
          Это система безопасности для проверки промптов, отправляемых к ИИ-ассистентам. Можно
          пройти короткое обучение по основным экранам.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onLater}
            className="px-3 py-2 text-sm text-slate-300 hover:text-white cursor-pointer"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={onStart}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer"
          >
            Начать обучение
          </button>
        </div>
      </div>
    </div>
  );
}
