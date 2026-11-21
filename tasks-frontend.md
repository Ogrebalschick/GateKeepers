# Tasks — Frontend-инженер (frontend:80)

> **Стек:** React 18 · Vite · TypeScript · react-router-dom · TanStack Query · Tailwind CSS · axios · nginx  
> **JSON-схемы всех эндпоинтов:** → `api-contract.md`  
> **Каждая задача:** 15–30 мин вайбкодинга с AI-агентом. Скопируй задачу как промпт — она самодостаточна.

---

### FE-001: Инициализация React проекта
**Время:** 20 мин | **Результат:** Проект стартует, показывает базовую страницу, 4 маршрута работают

**Шаги:**
- `npm create vite@latest frontend -- --template react-ts`
- Установить: `react-router-dom`, `axios`, `@tanstack/react-query`, `react-hot-toast`
- Установить и настроить Tailwind CSS: `tailwind.config.js`, `index.css`
- Создать структуру: `src/pages/`, `src/components/`, `src/services/`, `src/types/`
- `App.tsx`: `BrowserRouter` с 4 маршрутами: `/` (Dashboard), `/logs` (Journal), `/policy` (Policy), `/sessions` (Sessions)
- Временные stub-компоненты на каждом маршруте

**Критерий готовности:**
```bash
npm run dev
# localhost:5173 открывается, переход /logs → /policy → / работает
```

---

### FE-002: Настройка Nginx и Dockerfile для Frontend
**Время:** 20 мин | **Результат:** Docker-образ собирается, Nginx корректно проксирует запросы и раздаёт React-сборку

> **Архитектурный принцип:** весь внешний трафик идёт через порт `80` контейнера `frontend`.  
> Frontend-код НЕ знает о портах `8081` и `8000` — использует `baseURL: ""` (пустой), Nginx маршрутизирует сам.  
> Полная nginx-конфигурация: → `api-contract.md` раздел «Правило маршрутизации Nginx».

#### Шаг 1 — Создать `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;

    # Проксирование ML-сервиса (для evaluate.py и фронта)
    location /v1/ {
        proxy_pass http://ml-service:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Проксирование Backend API (журнал, политика, сессии, /auth/login)
    location /api/ {
        proxy_pass http://backend:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /auth/ {
        proxy_pass http://backend:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Раздача React SPA (React Router — history mode)
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
```

#### Шаг 2 — Создать `frontend/Dockerfile` (multi-stage)

```dockerfile
# ── Stage 1: сборка React-приложения ──────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Nginx раздаёт статику и проксирует API ───────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Шаг 3 — Убедиться что `src/services/api.ts` использует пустой `baseURL`

```ts
// ✅ Правильно — Nginx сам маршрутизирует
const apiClient = axios.create({ baseURL: "" });  // /api/* → backend:8081
const mlClient  = axios.create({ baseURL: "" });  // /v1/*  → ml-service:8000

// ❌ Неправильно — хардкод порта ломает Docker-окружение
const apiClient = axios.create({ baseURL: "http://localhost:8081" });
```

#### Шаг 4 — Добавить `.dockerignore` в `frontend/`

```
node_modules
dist
.env*
*.local
```

#### Шаг 5 — Убедиться, что в `docker-compose.yml` сервис `frontend` выглядит так

```yaml
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"          # основной порт; если 80 занят на хосте — замени на "8080:80"
    depends_on:
      - backend
      - ml-service
    restart: unless-stopped
```

> ⚠️ **Не добавляй** переменные окружения `REACT_APP_API_URL` / `VITE_API_URL` — они больше не нужны.  
> Frontend использует `baseURL: ""` и полагается на Nginx-прокси.

**Критерий готовности:**
```bash
# Шаг A — изолированная проверка образа (без backend/ml)
docker build -t frontend frontend/
docker run -p 3000:80 frontend
# → http://localhost:3000              — React SPA загружается
# → http://localhost:3000/logs        — не даёт 404 (React Router работает)

# Шаг B — полная проверка через docker-compose
docker-compose up --build
# → http://localhost                  — React SPA
# → curl http://localhost/v1/health   — 200 от ml-service
# → curl http://localhost/api/health  — 200 от backend
# → http://localhost/api/logs (с Bearer-токеном) — данные журнала

# evaluate.py — финальный прогон
python evaluate.py --data dev.jsonl --endpoint http://localhost/v1/check
# если порт 8080: --endpoint http://localhost:8080/v1/check
# если внешний IP: --endpoint http://<SERVER_IP>/v1/check
```

---

### FE-003: API-сервис и TypeScript-типы
**Время:** 20 мин | **Результат:** Единый модуль запросов с полной типизацией

> **Все схемы:** → `api-contract.md`

**Шаги:**
- `src/services/api.ts`: axios-инстанс с `baseURL: ""` (nginx проксирует), перехватчик ошибок
- `src/types/index.ts` — TypeScript-интерфейсы:
  - `CheckRequest`, `CheckResponse`
  - `LogItem`, `LogDetail`, `LogsResponse`
  - `PolicyVersion`, `PolicyUpdateRequest`, `PolicyUpdateResponse`
  - `ConfirmRequest`, `ConfirmResponse`
  - `Session`, `SessionDetail`, `SessionMessage`, `SessionsResponse`
  - `StatsResponse`, `TimelineItem`
- Функции-обёртки: `checkPrompt(req)`, `getLogs(filters)`, `getLogById(id)`, `exportLogs(filters)`, `getPolicy()`, `updatePolicy(data)`, `getPolicyHistory()`, `confirmAction(data)`, `createSession(data)`, `getSessions(filters)`, `getSessionById(id)`, `getStats()`, `getTimeline(hours)`

**Критерий готовности:**
```bash
npm run build
# TypeScript компилируется без ошибок
```

---

### FE-004: Layout — боковое меню и структура страниц
**Время:** 15 мин | **Результат:** Sidebar с 4 пунктами навигации

**Шаги:**
- `src/components/Layout.tsx`: sidebar слева + main content справа
- Sidebar: логотип «🛡️ ИИ-Сторож», ссылки через `<NavLink>`:
  - `🔍 Проверить` → `/`
  - `📋 Журнал` → `/logs`
  - `⚙️ Политика` → `/policy`
  - `💬 Сессии` → `/sessions`
- Активный пункт: Tailwind `bg-blue-700 text-white`, неактивный — `hover:bg-gray-700`
- Обернуть все `<Route>` в `<Layout>`

**Критерий готовности:**
Навигация отображается, активная страница выделена синим, переходы без перезагрузки страницы

---

### FE-005: Компоненты DecisionBadge и RiskBadge
**Время:** 10 мин | **Результат:** Переиспользуемые бейджи для решений и уровней риска

**Шаги:**
- `src/components/DecisionBadge.tsx`:
  - Props: `decision: "allow" | "confirm" | "block"`, `size?: "sm" | "md"`
  - `allow` → `bg-green-100 text-green-800`
  - `confirm` → `bg-yellow-100 text-yellow-800`
  - `block` → `bg-red-100 text-red-800`
- `src/components/RiskBadge.tsx`:
  - Props: `riskLevel: string`
  - `none` → серый, `low` → синий, `medium` → оранжевый, `high` → красный, `critical` → `bg-red-900 text-white`

**Критерий готовности:**
В `CheckPage` (после FE-006) — все варианты бейджей видны с правильными цветами

---

### FE-006: Страница Check — форма проверки промпта
**Время:** 25 мин | **Результат:** Пользователь отправляет промпт → видит решение Сторожа

> **Схема запроса/ответа:** → `api-contract.md` → `POST /v1/check`

**Шаги:**
- `src/pages/CheckPage.tsx`
- Форма:
  - `textarea` для `user_prompt` (обязательно)
  - `select` для `user_role`: developer / sre / admin
  - `input` для `user_name` (optional)
  - Кнопка «Проверить»
- Context формируется автоматически: `target_agent: "it_ops_agent"`, `user_id: "demo-user"`, `system_prompt: "Ты — DevOps-ассистент..."`, `history: []`, `attachments: []`
- Состояния: idle → loading (spinner) → result
- `CheckResultCard`: `DecisionBadge`, `RiskBadge`, `risk_category`, `explanation`, `latency_ms`, `pipeline_layer`
- Если `decision === "confirm"`: показать два дополнительных кнопки «✅ Подтвердить» и «❌ Отказать» → `confirmAction({check_id, user_decision, user_id: "demo-user"})`
- Toast при успешном подтверждении: «Действие подтверждено»

**Критерий готовности:**
```bash
# Ввести "Write malware" → decision=block (красный бейдж)
# Ввести "Restart search-indexer in production" с user_role=admin → decision=confirm + кнопки
# Нажать "Подтвердить" → toast "Действие подтверждено"
```

---

### FE-007: Страница Logs — журнал с фильтрами (+2б бонус)
**Время:** 25 мин | **Результат:** Таблица журнала с фильтрацией, пагинацией, экспортом

> **Схема ответа:** → `api-contract.md` → `GET /api/logs`

**Шаги:**
- `src/pages/LogsPage.tsx`
- Фильтры панель (вверху):
  - `select` Decision (All / Allow / Confirm / Block)
  - `select` Risk Level (All / None / Low / Medium / High / Critical)
  - `input` Search (полнотекстовый)
  - `input[type=date]` date_from и date_to
  - Кнопка «Сбросить»
- Таблица: колонки — Время, Роль, Запрос (до 80 символов + «...»), `DecisionBadge`, `RiskBadge`, Категория, Latency (мс), Слой
- Пагинация: кнопки «‹ Prev» / «Next ›», счётчик «Запись 1–50 из 342»
- Кнопка «📥 Экспорт CSV» → `window.location.href = "/api/logs/export.csv?" + params`
- Клик по строке → `LogDetailDrawer` (drawer справа)
- `LogDetailDrawer`: полный текст запроса, все поля ответа, статус подтверждения (Pending / Approved / Rejected)
- TanStack Query: кэш 30с, refetch при смене фильтров

**Критерий готовности:**
```bash
# Выбрать Decision=Block → таблица обновляется, только block записи
# Клик по записи → drawer открывается с полным текстом
# Экспорт CSV → файл скачивается
```

---

### FE-008: Страница Policy — редактор YAML (+3б бонус)
**Время:** 25 мин | **Результат:** Просмотр и редактирование политики с hot-reload

> **Схемы:** → `api-contract.md` → `GET /api/policy`, `PUT /api/policy`

**Шаги:**
- `src/pages/PolicyPage.tsx`
- Две вкладки: «Текущая политика» и «История версий»
- **Вкладка «Текущая политика»**:
  - Метаданные: Версия N, Обновлено: {updated_at}, Кем: {updated_by}
  - `textarea` с YAML (моноширинный шрифт, `font-mono`, строк 30)
  - Режим «Только чтение» по умолчанию (серый textarea, кнопка «✏️ Редактировать»)
  - Режим «Редактирование»: textarea активен, `input` для комментария, кнопки «💾 Сохранить» и «Отмена»
  - При сохранении: `PUT /api/policy` → если `reload_status="ok"` → toast «✅ Политика обновлена, версия N, ML перезагружен»
  - При ошибке 400: inline red banner с `detail`
  - При ошибке 422: inline red banner «Схема политики нарушена: {detail}»
- **Вкладка «История»**:
  - Таблица: Версия, Дата, Кем, Комментарий, Активная (✓)

**Критерий готовности:**
```bash
# Открыть /policy → YAML отображается в режиме readonly
# Нажать "Редактировать" → textarea активен
# Изменить строку → "Сохранить" → toast "Политика обновлена, версия 2"
# Вкладка "История" → 2 версии в таблице
```

---

### FE-009: Страница Sessions — история диалогов (+5б бонус)
**Время:** 25 мин | **Результат:** Создание сессий и просмотр многошаговых диалогов

> **Схемы:** → `api-contract.md` → `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{id}`

**Шаги:**
- `src/pages/SessionsPage.tsx` — список сессий
- Таблица: Session ID (короткий), Создана, Роль, Запросов/Лимит, Статус (active=зелёный / closed=серый), Угрозы
- Кнопка «➕ Новая сессия» → modal:
  - `select` user_role
  - `input[type=number]` max_requests (default: 100)
  - Кнопка «Создать» → `createSession()` → toast «Сессия создана: {session_id}»
- Клик по строке → `src/pages/SessionDetailPage.tsx`
- `SessionDetailPage`:
  - Заголовок: Session {id} · {status} · {request_count}/{max_requests} запросов
  - Список сообщений в хронологическом порядке (карточки)
  - Каждая карточка: `DecisionBadge`, `RiskBadge`, текст запроса (до 300 символов), explanation, время
  - Если `is_multi_step_attack=true` → красный баннер «⚠️ Многошаговая атака обнаружена»

**Критерий готовности:**
```bash
# Создать сессию → modal закрывается, сессия в списке
# Отправить 3 запроса через CheckPage с session_id → в SessionDetail видны 3 карточки
# Если 3 подряд block → карточка с "⚠️ Многошаговая атака"
```

---

### FE-010: Дашборд — статистика (главная страница /)
**Время:** 20 мин | **Результат:** Страница с агрегированными метриками

> **Схемы:** → `api-contract.md` → `GET /api/stats`, `GET /api/stats/timeline`

**Шаги:**
- `src/pages/DashboardPage.tsx` (или встроить в `/`)
- Верхний ряд — 5 карточек:
  - «Всего проверок» (total_checks)
  - «Заблокировано» (by_decision.block / total, красный %)
  - «Подтверждено» (confirm, жёлтый)
  - «Разрешено» (allow, зелёный)
  - «P95 latency» (latency_p95_ms ms)
- График Timeline (bar chart из SVG или `recharts`): X = часы, Y = количество, 3 бара (allow/confirm/block) по цветам
- Таблица «Топ категорий угроз»: категория + count
- Данные обновляются каждые 30 секунд (`refetchInterval: 30000` в TanStack Query)

**Критерий готовности:**
```bash
# Открыть / → карточки показывают реальные числа
# После нескольких запросов через CheckPage — числа обновляются через ≤30с
```

---

### FE-011: Toast, ErrorBoundary и финальная сборка
**Время:** 15 мин | **Результат:** Уведомления, обработка ошибок, production build

**Шаги:**
- Настроить `<Toaster>` из `react-hot-toast` в `App.tsx`
- Toast используется в: CheckPage (confirm/reject), PolicyPage (save success/error), SessionsPage (create)
- `src/components/ErrorBoundary.tsx`: показать friendly страницу вместо белого экрана при любой ошибке
- Настроить TanStack Query `QueryClient` с `retry: 1` и `staleTime: 30_000`
- `npm run build` — убедиться что нет TypeScript ошибок и dist/ создаётся

**Критерий готовности:**
```bash
npm run build
# Нет ошибок, dist/ создан
docker build -t frontend frontend/
# Образ собирается
```

---

---

### FE-012: Страница логина (`/login`)
**Время:** 30 мин | **Результат:** Пользователь вводит credentials → получает JWT → попадает на главную

> **Схема:** → `api-contract.md` → раздел `POST /auth/login`

**Шаги:**
- `src/pages/LoginPage.tsx`
- Центрированная карточка: логотип «🛡️ ИИ-Сторож», заголовок «Вход в систему»
- Форма: `input` username, `input[type="password"]` password, кнопка «Войти»
- При submit: `POST /auth/login` (через `api.ts`, **без** auth-заголовка)
- При успехе: сохранить в `localStorage`: `guard_token`, `guard_user_id`, `guard_role`, `guard_username`; редирект на `/` или на `?redirect=` параметр если есть
- При 401: toast «Неверный логин или пароль»
- Добавить блок-подсказку для жюри (grey box внизу формы):
  ```
  Demo credentials:
  admin / demo_admin_2026 (полный доступ)
  sre_user / demo_sre_2026 (просмотр)
  dev_user / demo_dev_2026 (свои данные)
  ```
- Добавить маршрут `/login` в `App.tsx`

**Критерий готовности:**
```
Ввод admin / demo_admin_2026 → localStorage.guard_token заполнен → редирект на /
Ввод admin / wrongpass → toast "Неверный логин или пароль"
```

---

### FE-013: Axios-интерцептор авторизации
**Время:** 20 мин | **Результат:** Все `/api/*` запросы автоматически получают токен; `/v1/check` — нет

**Шаги:**
- В `src/services/api.ts`:
  - **Request interceptor**: перед каждым запросом читать `localStorage.getItem("guard_token")`; если URL содержит `/api/` → добавить `Authorization: Bearer <token>`; если URL содержит `/v1/` или `/auth/` → **не добавлять** заголовок
  - **Response interceptor**:
    - При статусе 401 → очистить `localStorage` (ключи `guard_*`) → `window.location.href = "/login"`
    - При статусе 403 → toast `"Недостаточно прав для этой операции"`
- Функция `checkPrompt()` вызывает `POST /v1/check` — убедиться что она НЕ получает auth-заголовок (URL `/v1/check` не содержит `/api/`)
- Экспортировать утилиту `getAuthHeaders()` для прямых вызовов если нужно
- Добавить функцию `logout()`: очистить `localStorage`, редирект на `/login`

**Критерий готовности:**
```
После логина как admin: getLogs() → 200
Без логина: getLogs() → редирект на /login
checkPrompt() → работает без токена (evaluate.py совместимость)
```

---

### FE-014: UserInfo в Layout + кнопка «Выйти»
**Время:** 15 мин | **Результат:** Видно кто залогинен, есть кнопка выхода, скрыты недоступные разделы

**Шаги:**
- В `src/components/Layout.tsx` добавить нижнюю секцию sidebar:
  - Иконка пользователя + username из `localStorage.guard_username`
  - Role-badge: `admin` → красный, `sre` → синий, `developer` → серый
  - Кнопка «Выйти» → вызов `logout()` из `api.ts`
- Скрыть пункты sidebar на основе роли:
  - «⚙️ Политика» — показывать только `admin` и `sre` (developer не видит редактор)
  - «📊 Статистика» / дашборд full view — только `admin` и `sre`
- Добавить хук `useCurrentUser() -> { userId, role, username }` — читает из localStorage

**Критерий готовности:**
```
Логин как developer → в sidebar нет кнопки "Политика" (или она disabled)
Логин как admin → все разделы видны
Нажать "Выйти" → редирект на /login, localStorage очищен
```

---

### FE-015: Protected Routes
**Время:** 15 мин | **Результат:** Прямой переход на `/logs` без токена → редирект на `/login`

**Шаги:**
- `src/components/ProtectedRoute.tsx`:
  - Проверяет `localStorage.getItem("guard_token")` — если нет → `<Navigate to={"/login?redirect=" + encodeURIComponent(location.pathname)} />`
  - Если токен есть → рендерит `children`
  - Опционально: декодировать JWT (без верификации подписи — это на сервере) для проверки `exp` на клиенте; если истёк → редирект на `/login`
- В `App.tsx` обернуть все маршруты кроме `/login`:
  - `/` — **публичный** (демо-форма для жюри без логина) ИЛИ защищённый — на усмотрение команды
  - `/logs`, `/policy`, `/sessions` — **защищённые** через `ProtectedRoute`
- После успешного логина (`LoginPage`) редиректить на `?redirect` если есть, иначе на `/`

**Критерий готовности:**
```bash
# Открыть /logs без токена в браузере → редирект на /login?redirect=%2Flogs
# Залогиниться → редирект обратно на /logs
# Открыть /logs с токеном → страница загружается
```

---

## Порядок выполнения

| Этап | Задачи | Когда | Цель |
|------|--------|-------|------|
| Ночь 1 | FE-001 → FE-002 → FE-003 → **FE-012 → FE-013** | 22:00–01:00 | Проект стартует, логин работает, типы готовы |
| День 2 утро | FE-004 → FE-005 → **FE-015** → FE-006 → **FE-014** | 09:00–11:00 | Protected routes + CheckPage |
| День 2 день | FE-007 → FE-008 | 11:00–14:00 | Журнал (+2б) + Политика (+3б) |
| День 2 вечер | FE-009 → FE-010 → FE-011 | 14:00–17:00 | Сессии (+5б) + Дашборд + финальный build |

## Привязка к бонусам ТЗ

| Бонус | Баллы | Задачи |
|-------|-------|--------|
| Журнал с фильтрами | +2б | FE-007 |
| Версия политики (отображение) | +1б | FE-008 (вкладка «История») |
| Изменение политики с валидацией | +2б | FE-008 (PUT + inline ошибки) |
| История диалогов | +2б | FE-009 (сессии + сообщения) |
| Многошаговые атаки (UI) | +2б | FE-009 (`is_multi_step_attack` баннер) |
| Лимиты сессий (UI) | +1б | FE-009 (closed статус) |
| **JWT-авторизация (демо)** | — | FE-012 → FE-013 → FE-014 → FE-015 |

## Компоненты для переиспользования

| Компонент | Используется в |
|-----------|---------------|
| `DecisionBadge` | CheckPage, LogsPage, SessionDetailPage |
| `RiskBadge` | CheckPage, LogsPage, SessionDetailPage |
| `LogDetailDrawer` | LogsPage |
| `Layout` | Все страницы |
| `ErrorBoundary` | App.tsx (wrap всего) |
| `ProtectedRoute` | App.tsx (все маршруты кроме /login) |
