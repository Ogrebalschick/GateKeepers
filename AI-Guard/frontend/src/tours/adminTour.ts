import type { NavigateFunction } from 'react-router-dom';
import type { Step } from 'react-joyride';

export const TOUR_COMPLETED_KEY = 'guard_tour_completed';
export const TOUR_PROMPTED_KEY = 'guard_tour_prompted';

const PROTECTED_ROUTES = new Set(['/logs', '/policy', '/sessions', '/dashboard']);

interface TourStepInput {
  target: string;
  title: string;
  content: string;
  placement?: Step['placement'];
  route?: string;
}

const TOUR_STEPS: TourStepInput[] = [
  {
    target: 'body',
    title: 'Добро пожаловать в ИИ-Сторож!',
    content:
      'Это система безопасности для проверки промптов, отправляемых к ИИ-ассистентам. Сейчас мы пройдём по всем ключевым функциям. Нажмите «Далее» для начала.',
    placement: 'center',
    route: '/',
  },
  {
    target: '#tour-check-input',
    title: 'Проверка запроса',
    content:
      'Здесь вы вводите промпт пользователя, который хотите проверить. ИИ-Сторож проанализирует его и решит: разрешить, заблокировать или запросить подтверждение.',
    placement: 'right',
    route: '/',
  },
  {
    target: '#tour-check-role',
    title: 'Роль пользователя',
    content:
      'Выберите роль, от имени которой отправляется запрос. Разные роли имеют разные права: admin — полный доступ, sre — просмотр, developer — ограниченный.',
    placement: 'right',
    route: '/',
  },
  {
    target: '#tour-check-submit',
    title: 'Запуск проверки',
    content:
      'Нажмите эту кнопку, чтобы отправить промпт на проверку. ИИ-Сторож оценит запрос по политике безопасности и вернёт решение.',
    placement: 'top',
    route: '/',
  },
  {
    target: '#tour-check-result',
    title: 'Результат проверки',
    content:
      'Здесь отображается решение: «Разрешено» (зелёный), «Заблокировано» (красный) или «Требует подтверждения» (жёлтый). Также показаны категория риска, объяснение и задержка обработки.',
    placement: 'left',
    route: '/',
  },
  {
    target: '#tour-check-agent',
    title: 'Ответ ассистента',
    content:
      'Если запрос разрешён, здесь появится ответ ИИ-ассистента. Если заблокирован — ассистент не получит запрос.',
    placement: 'left',
    route: '/',
  },
  {
    target: '#tour-logs-link',
    title: 'Журнал проверок',
    content:
      'Здесь хранится история всех проверок. Вы можете фильтровать по решению, уровню риска, датам и искать по тексту промпта.',
    placement: 'right',
    route: '/logs',
  },
  {
    target: '#tour-logs-table',
    title: 'Таблица логов',
    content:
      'Каждая строка — одна проверка. Кликните на строку, чтобы увидеть детали: полный промпт, контекст, решение модели и статус подтверждения.',
    placement: 'top',
    route: '/logs',
  },
  {
    target: '#tour-policy-link',
    title: 'Управление политикой',
    content:
      'Здесь администратор может изменить YAML-политику безопасности. После сохранения новая версия политики автоматически загружается в ML-сервис.',
    placement: 'right',
    route: '/policy',
  },
  {
    target: '#tour-sessions-link',
    title: 'Сессии',
    content:
      'Сессии позволяют отслеживать многошаговые атаки. Если пользователь в рамках одной сессии отправляет несколько подозрительных запросов, система может заблокировать всю сессию.',
    placement: 'right',
    route: '/sessions',
  },
  {
    target: '#tour-dashboard-link',
    title: 'Дашборд',
    content:
      'Здесь собрана статистика: общее количество проверок, распределение по решениям, топ категорий рисков и график активности за последние 24 часа.',
    placement: 'right',
    route: '/dashboard',
  },
  {
    target: 'body',
    title: 'Тур завершён!',
    content:
      'Теперь вы знаете основные функции ИИ-Сторожа. Вы можете запустить тур снова через кнопку «Пройти обучение» в боковом меню. Удачи на демо!',
    placement: 'center',
  },
];

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitFor(check: () => boolean, timeoutMs = 2000) {
  return new Promise<void>((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (check() || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

export function createAdminTourSteps(navigate: NavigateFunction, isAuthenticated: boolean): Step[] {
  return TOUR_STEPS.map((step) => {
    const blocked = !!step.route && PROTECTED_ROUTES.has(step.route) && !isAuthenticated;
    const target = blocked ? 'body' : step.target;
    const placement = blocked ? 'center' : step.placement;
    const route = blocked ? undefined : step.route;

    return {
      target,
      title: step.title,
      content: step.content,
      placement,
      data: { route },
      before: async () => {
        if (!route || window.location.pathname === route) return;
        navigate(route);
        await waitFor(
          () =>
            window.location.pathname === route &&
            (target === 'body' || document.querySelector(target) !== null),
        );
        await delay(400);
      },
    };
  });
}
