# Tasks — Интеграция Frontend ↔ Backend

> **Стек:** React 18 · Vite · axios (frontend:80) · FastAPI · SQLAlchemy async · MariaDB (backend:8081) · ml-service:8000  
> **JSON-схемы всех эндпоинтов:** → `api-contract.md`  
> **Код:** `AI-Guard/frontend`, `AI-Guard/backend`, `AI-Guard/ml-service`, `AI-Guard/docker-compose.yml`  
> **Каждая задача:** 15–30 мин. Скопируй задачу как промпт — она самодостаточна. Делай по одной, не перескакивай.

> **Канонический путь запроса.** Браузер не знает портов `8081` и `8000`.  
> `POST /v1/check` → nginx → **ml-service:8000** (без JWT, так вызывает `evaluate.py`).  
> ml-service после проверки сам пишет лог: `POST http://backend:8081/internal/checks`.  
> `/api/*` и `/auth/*` → nginx → **backend:8081**, JWT только на `/api/*`.  
> Не переключай `location /v1/` на backend: у backend тоже есть `POST /v1/check`, это запасной шлюз, не путь UI.

---

### INT-001: Порты, env и docker-compose под контракт
**Время:** 25 мин | **Результат:** backend слушает 8081, ml-service достучится до него, frontend nginx больше не попадает в пустоту

Сейчас `AI-Guard/backend/Dockerfile` делает `EXPOSE 8000` и `uvicorn --port 8000`. `AI-Guard/docker-compose.yml` публикует `8000:8000` и healthcheck бьёт в `localhost:8000`. Nginx в `AI-Guard/frontend/nginx.conf` проксирует `/api/` и `/auth/` на `backend:8081`. `AI-Guard/ml-service/Dockerfile` задаёт `BACKEND_URL=http://backend:8000`. Эти три значения должны сойтись на контракте: backend **8081**, ml-service **8000**.

**Шаги:**
- `AI-Guard/backend/Dockerfile`: `EXPOSE 8081`, `CMD` uvicorn `--port 8081`
- `AI-Guard/docker-compose.yml`, сервис `backend`:
  - `ports: ["8081:8081"]`
  - healthcheck: `curl -f http://localhost:8081/health`
  - убрать `DATABASE_URL=mariadb+pymysql://...` — `Settings.DATABASE_URL` и так собирается как `mysql+aiomysql://` из `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`, лишняя переменная игнорируется (`extra="ignore"`) и путает
  - `environment`: `DB_HOST=database`, `ML_SERVICE_URL=http://ml-service:8000`
- `AI-Guard/ml-service/Dockerfile`: `BACKEND_URL=http://backend:8081` (сейчас `:8000`)
- В compose у `ml-service` явно продублировать `BACKEND_URL=http://backend:8081` и опубликовать `8000:8000` — порт нужен для `npm run dev` и отладки. Наружу для жюри по-прежнему достаточно порта `80`
- `.env.example` в корне и те же ключи в env backend: `JWT_SECRET`, `JWT_EXPIRATION=86400`, `ADMIN_PASSWORD=demo_admin_2026`, `SRE_PASSWORD=demo_sre_2026`, `DEV_PASSWORD=demo_dev_2026`. Пустой `JWT_SECRET` ломает логин
- `location /v1/` в nginx **не менять** — цель `ml-service:8000`

**Критерий готовности:**
```bash
cd AI-Guard
docker compose up --build -d
curl -s http://localhost:8081/health    # {"status":"ok",...}
curl -s http://localhost:8000/health    # ml-service
curl -s -o /dev/null -w "%{http_code}" http://localhost/api/logs
# → 401 (nginx дошёл до backend, токена нет)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/v1/check \
  -H "Content-Type: application/json" \
  -d '{"user_prompt":"ping","context":{"target_agent":"it_ops_agent","user_role":"admin","user_id":"u-1","user_name":"t","system_prompt":"","history":[],"attachments":[]}}'
# → 200, decision есть. Заголовок Authorization не нужен
```

---

### INT-002: Settings — ML_SERVICE_URL, backend стартует без AttributeError
**Время:** 15 мин | **Результат:** `/health` и код policy-reload читают URL ML из настроек, а не падают

`AI-Guard/backend/app/main.py` обращается к `settings.ML_SERVICE_URL` в `/health`, в запасном `POST /v1/check` и в `POST /internal/reload-policy`. В `AI-Guard/backend/app/config.py` этого поля нет — первый же `/health` с проверкой ML даёт `AttributeError`.

**Шаги:**
- В `Settings` добавить:
  - `ML_SERVICE_URL: str = "http://ml-service:8000"`
  - `ML_TIMEOUT_SECONDS: float = 8.0`
- `getattr(settings, "ML_TIMEOUT_SECONDS", 8.0)` заменить на `settings.ML_TIMEOUT_SECONDS`
- Если ML не отвечает, `/health` остаётся `200` и `"ml_service_reachable": false` — это уже так, не превращай недоступность ML в 500
- Запасной `POST /v1/check` на backend **не удалять**, но убрать из него запись в таблицу `checks`. Единственный писатель журнала — `POST /internal/checks` (его вызывает ml-service). Иначе один и тот же `check_id` или два разных ряда на одну проверку

**Критерий готовности:**
```bash
curl -s http://localhost:8081/health
# status=ok, ключ ml_service_reachable есть, процесс не перезапустился
# В логах backend нет AttributeError: ML_SERVICE_URL
```

---

### INT-003: Vite proxy — локальный `npm run dev` бьёт в те же пути
**Время:** 15 мин | **Результат:** `localhost:5173` ходит в backend и ml-service, `baseURL` остаётся пустым

`AI-Guard/frontend/vite.config.ts` сейчас без `server.proxy`. В Docker маршрутизирует nginx, в `npm run dev` — никто. `src/services/api.ts` уже создаёт оба клиента с `baseURL: ""`. Не вводи `VITE_API_URL`.

**Шаги:**
- В `defineConfig` добавить:
```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:8081', changeOrigin: true },
    '/auth': { target: 'http://localhost:8081', changeOrigin: true },
    '/v1': { target: 'http://localhost:8000', changeOrigin: true },
  },
},
```
- `/v1` проксируется на **ml-service**, не на backend
- Перехватчик в `api.ts` не трогать: Bearer только если URL содержит `/api/`

**Критерий готовности:**
```bash
cd AI-Guard/frontend && npm run dev
# другой терминал, backend и ml уже подняты:
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/logs
# → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5173/v1/check \
  -H "Content-Type: application/json" \
  -d '{"user_prompt":"ping","context":{"user_role":"admin","user_id":"u-1","user_name":"t","system_prompt":"","history":[],"attachments":[]}}'
# → 200
```

---

### INT-004: Реальный `POST /auth/login` вместо мока
**Время:** 20 мин | **Результат:** Форма логина получает JWT backend, в `localStorage` лежат id и роль из токена

`login()` в `AI-Guard/frontend/src/services/api.ts` сверяет пароль с `DEMO_CREDENTIALS` и кладёт `access_token: "mock-jwt-token"`, а `user_id` — `usr_admin_001` / `usr_sre_002` / `usr_dev_003`. Backend (`app/auth.py`) выдаёт настоящий JWT и id `u-admin-001`, `u-sre-001`, `u-dev-001`. Пока мок жив, роль в сайдбаре совпадает случайно, а фильтр «только свои» на backend никогда не совпадёт с id из localStorage.

**Шаги:**
- Заменить тело `login()` на уже подписанный в комментарии вызов:
  `return apiClient.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data)`
- Удалить `DEMO_CREDENTIALS` и ручной `reject` с фейковым 401. Ошибку 401 отдаёт axios, `LoginPage` уже показывает toast «Неверный логин или пароль»
- `LoginPage` по-прежнему пишет `guard_token`, `guard_user_id`, `guard_role`, `guard_username` из ответа. `user_id` брать только из `data.user_id`, не из мок-таблицы
- Блок demo credentials на странице логина не убирать
- Остальные мок-функции в этом шаге не трогать

**Критерий готовности:**
```bash
# admin / demo_admin_2026 → в localStorage guard_token начинается с "eyJ", guard_user_id === "u-admin-001", guard_role === "admin", редирект на /
# admin / wrongpass → toast, токен не записан
# Выйти и зайти как dev_user / demo_dev_2026 → guard_user_id === "u-dev-001", guard_role === "developer"
```

---

### INT-005: Журнал на backend — фильтры, карточка, поля которые уже читает UI
**Время:** 30 мин | **Результат:** `GET /api/logs`, `GET /api/logs/{id}` и CSV отдают форму, на которую рассчитаны `LogsPage` и `LogDetailDrawer`

`GET /api/logs` есть, но без `search`, `date_from`, `date_to` и без полей `has_attachments` и `confirm_status`. `GET /api/logs/{id}` нет — drawer вызывает `getLogById`. CSV не принимает фильтры. Контракт списка не содержит `confirm_status`, но `LogDetailDrawer` и тип `LogItem` его читают: колонка в БД называется `confirmation_status` (`approved` | `rejected` | NULL). NULL на проводе отдавать как `"pending"`.

**Шаги:**
- `GET /api/logs` — query-параметры из контракта, включая `search` (LIKE по `user_prompt`), `date_from`, `date_to` (ISO 8601, граница `date_to` включительно до конца дня)
- `developer`: как сейчас, принудительный `user_id = current_user.user_id`, query-параметр не может его обойти
- В каждый item добавить:
  - `confirm_status`: `confirmation_status` или `"pending"`
  - `has_attachments`: `true`, если в `context_json` массив `attachments` непустой
  - `user_prompt` обрезать до 200 символов
- `GET /api/logs/{id}` → объект `LogDetail` из контракта плюс `confirm_status`. `context` собрать из `context_json`: `target_agent`, `user_role`, `user_id`, `user_name`, `history_count`, `attachments_count`, `attachments[].content_preview` до 500 символов. Чужой id для `developer` → 403 `{"error":"forbidden"}`. Нет строки → 404 `{"error":"not_found"}`
- `GET /api/logs/export.csv` — те же фильтры, что у списка (без page/per_page), роль `admin`/`sre`, `Content-Disposition: attachment`. Ответ должен открываться с заголовком `Authorization` (фронт качает blob через axios, не через `window.location`)

**Критерий готовности:**
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"demo_admin_2026"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s "http://localhost:8081/api/logs?decision=block&search=test&page=1&per_page=5" \
  -H "Authorization: Bearer $TOKEN"
# items[].confirm_status и has_attachments присутствуют
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/api/logs/999999 \
  -H "Authorization: Bearer $TOKEN"
# → 404
```

---

### INT-006: Подключить журнал и CSV во frontend
**Время:** 20 мин | **Результат:** `LogsPage` показывает строки из MariaDB, drawer и экспорт ходят в backend

Моки: `getLogs`, `getLogById`, `exportLogs` и `requireAuth()` в `api.ts`. Страницы уже вызывают эти функции и сами не знают про мок.

**Шаги:**
- `getLogs` → `apiClient.get<LogsResponse>('/api/logs', { params })`
- `getLogById` → `apiClient.get<LogDetail>(\`/api/logs/${id}\`)`
- `exportLogs` → `apiClient.get('/api/logs/export.csv', { params, responseType: 'blob' })` и вернуть `Blob`. Не переходить на `window.location`: браузер не приложит Bearer
- Удалить `filterMockLogs` только если на нём больше никто не сидит. Если `getStats` ещё считает мок-массив `MOCK_LOGS` — массив пока оставить, вызовы журнала от него отвязать
- 401 по-прежнему обрабатывает interceptor (очистка `guard_*`, редирект на `/login`)

**Критерий готовности:**
```bash
# Залогинен admin, в БД есть хотя бы одна проверка:
# /logs → таблица с этой строкой, не с семью захардкоженными MOCK_LOGS
# Decision=block → запрос уходит с ?decision=block, таблица сужается
# Клик по строке → drawer, полный user_prompt
# «Экспорт CSV» → файл скачивается, в Network статус 200 и заголовок Authorization
# Без токена /logs → /login?redirect=...
```

---

### INT-007: Один писатель журнала — ml-service → `/internal/checks`
**Время:** 25 мин | **Результат:** Проверка с сайта появляется в `/api/logs` с тем же `user_id`, что в JWT

Сейчас ml-service шлёт лог фоном (`BackgroundTasks`) и **без** `user_id` / `user_role` / `user_name` — они только внутри `context_json`. `POST /internal/checks` читает их с верхнего уровня и пишет NULL. Колонки `user_role`, `user_id`, `user_name` в модели объявлены как `NOT NULL`. Плюс фоновая отправка: `CheckPage` сразу инвалидирует кэш `['logs']` и строки ещё нет.

**Шаги:**
- В `AI-Guard/ml-service/app/routers/check.py` в `log_payload` добавить поля из context: `user_id`, `user_role`, `user_name`
- Вызвать `_send_backend_log` **до** `return response`, таймаут оставить ~1.5 с. Ошибка доставки логируется и **не** меняет decision — проверка пользователю всё равно возвращается
- В `internal_checks` (`backend/app/main.py`): если верхнего `user_id` нет, достать `user_id` / `user_role` / `user_name` из `context_json`. Пустую строку вместо NULL
- Идемпотентность по `check_id` оставить (`duplicated: true`)
- Ответ 201: `{"ok": true}`. Поле `is_multi_step_attack` добавит INT-010, здесь его не выдумывать

**Критерий готовности:**
```bash
curl -s -X POST http://localhost/v1/check \
  -H "Content-Type: application/json" \
  -d '{"user_prompt":"Show deployment status","context":{"target_agent":"it_ops_agent","user_role":"developer","user_id":"u-dev-001","user_name":"dev_user","system_prompt":"","history":[],"attachments":[]},"session_id":null}'
# Сразу после ответа, с admin-токеном:
# GET /api/logs → верхняя строка с этим user_id, user_role=developer, user_name=dev_user
# Повтор с тем же check_id не создаёт вторую строку
```

---

### INT-008: Подключить `POST /api/confirm`
**Время:** 15 мин | **Результат:** Кнопки «Подтвердить» / «Отказать» на CheckPage пишут статус в БД

Backend-эндпоинт уже есть: ищет `check_id`, 404 `check_not_found`, 409 `already_confirmed`, пишет `confirmation_status`, `confirmed_by` из JWT. Фронт (`confirmAction`) пока помечает мок-массив.

**Шаги:**
- `confirmAction` → `apiClient.post<ConfirmResponse>('/api/confirm', data)`
- `CheckPage.handleDecision` уже инвалидирует `['logs']` и `['log']`. На 409 показать toast «Уже подтверждено», не затирать успешный сценарий
- Подтверждение требует логин: без токена interceptor уведёт на `/login`. Это ожидаемо, отдельный анонимный confirm не делать
- `confirmed_by` на сервере брать из токена (уже так). Тело `user_id` можно слать, но не доверять ему

**Критерий готовности:**
```bash
# Залогинен admin. Проверка с decision=confirm → «Подтвердить»
# toast «Действие подтверждено»
# GET /api/logs/{id} → confirm_status=approved, в БД confirmed_by=u-admin-001
# Повторное нажатие → 409, toast «Уже подтверждено»
```

---

### INT-009: Одна схема политики и hot-reload ML
**Время:** 30 мин | **Результат:** Сохранение YAML в UI валидируется так же, как ml-service, и уходит в `/internal/reload-policy`

Два разных YAML. `AI-Guard/backend/app/resources/security_policy.yaml` — дерево `roles:`. `AI-Guard/ml-service/policy.yaml` и `policy_loader._REQUIRED_TOP_LEVEL` — `always_block`, `agents`, `decisions`. `PolicyStore.apply()` требует ключи `version` и `roles` и любую ошибку превращает в 400. `PUT /api/policy` всегда отвечает `reload_status: "ok"` и **не** вызывает ML. Редактор на фронте уже различает 400, 422 и `reload_status !== "ok"`.

**Шаги:**
- При старте backend, если активной версии нет, грузить в БД содержимое **того же** файла, что читает ML (`ml-service/policy.yaml`). Файл в образе backend положить в `app/resources/security_policy.yaml` копией ML-политики, не старым деревом `roles:`
- `PolicyStore.apply()`:
  - битый YAML → исключение, роутер отдаёт 400 `{"error":"invalid_yaml","detail":...}`
  - YAML разобрался, но нет `always_block` / `agents` / `decisions` или типы не те → 422 `{"error":"schema_violation","detail":...}`
  - Правила сверки повторить по `ml-service/app/utils/policy_loader.py` (`_validate_policy`), чтобы backend не сохранял то, что ML отвергнет
- После успешного commit вызвать `POST {ML_SERVICE_URL}/internal/reload-policy` с `{"content_yaml","version"}`. HTTP 200 → `reload_status: "ok"`. Таймаут, сеть, не-200 → политика в БД **остаётся**, `reload_status: "failed"`. Не откатывать версию
- `updated_by` писать из `current_user.user_id`, не из тела. Роль на `PUT` — только `admin` (уже стоит `require_roles("admin")`)
- `GET /api/policy` и `GET /api/policy/history` уже близки к контракту: проверить, что `updated_at` есть (сейчас оба времени берутся из `created_at` — для истории это нормально, отдельную колонку не заводить)

**Критерий готовности:**
```bash
# admin PUT с валидным YAML (копия policy.yaml, version: 2) → 200, reload_status=ok
# curl http://localhost:8000/health → policy_version совпадает с version из ответа PUT
# PUT с "!!!" → 400 invalid_yaml
# PUT с "{}" или YAML без agents → 422 schema_violation, активная версия не сменилась
# sre PUT → 403
# Остановить ml-service, PUT валидный YAML → 200, reload_status=failed, GET /api/policy показывает новую version
```

---

### INT-010: Подключить страницу Policy
**Время:** 15 мин | **Результат:** Редактор читает и сохраняет политику backend, история версий — из БД

**Шаги:**
- `getPolicy` → `GET /api/policy`
- `updatePolicy` → `PUT /api/policy`
- `getPolicyHistory` → `GET /api/policy/history`
- `PolicyPage` не переписывать: она уже смотрит `reload_status`, 400 и 422 через `readApiError`
- Убедиться, что `updated_by` в теле можно оставить (backend его игнорирует) — страницу не ломать
- SRE открывает вкладки и не видит режим редактирования (это уже на странице). После этой задачи запрос `GET` от sre должен быть 200, не мок

**Критерий готовности:**
```bash
# admin: /policy → YAML из БД, не MOCK_POLICY_YAML с rules: block_jailbreak
# Правка + комментарий → toast «Политика обновлена, версия N, ML перезагружен»
# Вкладка «История» → старая и новая версии, активна одна
# Нарочно сломать отступ YAML → красный баннер, версия не растёт
```

---

### INT-011: Сессии в БД — связь с проверкой, лимит, многошаговая атака
**Время:** 30 мин | **Результат:** Каждая проверка с `session_id` увеличивает счётчик и помечает третий block подряд

Модель `GuardSession` есть (`sessions`), таблицы связи с проверками нет, роутеров нет. Мок на фронте сам закрывает сессию на `max_requests` и ставит `is_multi_step_attack`, если три последних решения в сессии — `block`.

**Шаги:**
- Модель `CheckSession`, таблица `check_sessions`: `id`, `session_id` (index), `check_id` (unique), `message_index`, `is_multi_step_attack` (bool, default false). `create_all` на старте уже вызывается — новая модель подхватится. Для уже поднятой БД достаточно перезапуска, если `create_all` создаёт недостающие таблицы (не делает ALTER старых)
- В `POST /internal/checks`, если `session_id` не пустой и сессия с таким id есть:
  - не трогать сессию со `status="closed"`: проверку в `checks` сохранить, в сессию не добавлять, счётчик не растить
  - иначе: `request_count += 1`, `last_activity_at = now`, строка в `check_sessions` со следующим `message_index`
  - `is_multi_step_attack = true`, когда текущее решение `block` и два предыдущих сообщения этой сессии тоже `block`
  - при флаге дописать `"multi_step_attack"` в `threat_flags_json`, если его ещё нет
  - если `request_count >= max_requests` → `status="closed"`
- Ответ 201 дополнить: `{"ok": true, "is_multi_step_attack": false}` (или `true`)
- В `check.py` ml-service: если в ответе backend есть `is_multi_step_attack`, прокинуть его в JSON `POST /v1/check` дополнительным полем. Схема `CheckResponse` на ML — с `extra` или явным optional-полем, чтобы клиент его не отрезал. Контрактное ядро ответа не менять: `decision`, `risk_level`, `risk_category`, `explanation`, `latency_ms`, `pipeline_layer`, `check_id` обязательны. `evaluate.py` лишнее поле переживёт, если ответ остаётся объектом с этими ключами. Если сомневаешься — не добавляй поле в модель ответа ML, баннер на CheckPage и так завязан на optional

**Критерий готовности:**
```bash
# Сессия создана вручную INSERT или временным curl — до INT-012 можно вставить строку в sessions
# 3 POST /v1/check с одним session_id и промптами, которые ML режет как block
# третья запись check_sessions.is_multi_step_attack = 1
# request_count вырос на 3
# сессия с max_requests=1 после одной проверки имеет status=closed
# следующая проверка с этим session_id в checks есть, request_count остаётся 1
```

---

### INT-012: Sessions API
**Время:** 25 мин | **Результат:** `POST/GET /api/sessions` и `GET /api/sessions/{id}` совпадают с типами фронта

Контракт: `api-contract.md` → `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{session_id}`.

**Шаги:**
- `POST /api/sessions` (JWT, любая роль) → 201, `session_id` UUID, `status="active"`, `request_count=0`, `max_requests` из тела или 100. `user_id`: для `developer` всегда `current_user.user_id`; для admin/sre — из тела, если передано, иначе из токена
- `GET /api/sessions`: фильтры `status`, `user_id`, `page`, `per_page` (default 20). `developer` видит только свои. В item есть `threat_flags: string[]` — распарсить `threat_flags_json`
- `GET /api/sessions/{session_id}`: те же поля плюс `messages[]` из `check_sessions` JOIN `checks` по возрастанию `message_index`. `user_prompt` в сообщении — первые 300 символов. Поля сообщения как в `SessionMessage`. Нет сессии → 404 `{"error":"session_not_found"}`. Чужая сессия для developer → 403
- Список не отдаёт `messages`

**Критерий готовности:**
```bash
curl -s -X POST http://localhost:8081/api/sessions \
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"user_id":"u-admin-001","user_role":"admin","max_requests":5,"metadata":null}'
# → 201, session_id
# две проверки /v1/check с этим session_id
curl -s http://localhost:8081/api/sessions/$SID -H "Authorization: Bearer $ADMIN"
# messages.length == 2, request_count == 2, status == active
# токен dev_user на чужой session_id → 403
```

---

### INT-013: Подключить сессии и выбор сессии на CheckPage
**Время:** 25 мин | **Результат:** Список сессий, карточка диалога и новая сессия живут в БД, а не в localStorage

`CheckPage` при выборе «новая» делает `crypto.randomUUID()` и шлёт его как `session_id`. Backend такую сессию не знает, INT-011 её не посчитает. `createSession` / `getSessions` / `getSessionById` всё ещё моки.

**Шаги:**
- Три функции в `api.ts` перевести на `apiClient` (`POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{id}`)
- `CheckPage`: вариант «новая сессия» сначала вызывает `createSession` (`user_id` и `user_role` из localStorage, `max_requests: 100`, `metadata: null`) и только потом кладёт возвращённый `session_id` в запрос проверки. Гостевой режим без токена (страница `/` публичная): сессию не создавать, `session_id: null`. Селект сессий и так включён только при токене
- Закрытую сессию в селекте не выбирать для нового запроса (disabled или скрыть). Не полагаться на текст ошибки мока «Сессия закрыта»
- `SessionsPage` и `SessionDetailPage` не переписывать — они уже рисуют `threat_flags`, `request_count/max_requests`, статус и баннер `is_multi_step_attack`
- Баннер на `CheckPage` оставить как есть: он смотрит optional `result.is_multi_step_attack`. Нет поля — баннера нет, страница не падает

**Критерий готовности:**
```bash
# Залогинен admin → «Новая сессия» на /sessions → строка в списке, request_count 0, status active
# На / выбрать эту сессию, отправить 2 промпта → /sessions/:id показывает 2 карточки в том же порядке
# Сессия с max_requests=1 после одного запроса в списке closed
# dev_user не видит сессию admin
```

---

### INT-014: `GET /api/stats` и `GET /api/stats/timeline` в форме дашборда
**Время:** 25 мин | **Результат:** Ответ содержит все ключи, которые `DashboardPage` читает без опциональной цепочки

Сейчас `GET /api/stats` возвращает только `total_checks`, `by_decision`, `by_risk_level`, и словари дырявые: нет ключа `block` → `stats.by_decision.block` на дашборде кидает исключение. Нет `top_categories`, перцентилей latency, `by_pipeline_layer`, `period_hours`. `GET /api/stats/timeline` нет вообще. Роль `admin`/`sre` уже ограничена на `/api/stats`.

**Шаги:**
- `GET /api/stats?period_hours=24` (default 24). Считать только строки с `created_at` внутри окна
- Всегда отдавать нули, а не пропускать ключ:
  - `by_decision`: `allow`, `confirm`, `block`
  - `by_risk_level`: `none`, `low`, `medium`, `high`, `critical`
  - `by_pipeline_layer`: как минимум `layer0`, `layer1`, `layer2` (прочие слои тоже можно добавить)
  - `top_categories`: до 10 пар `{category, count}`, без пустой категории, по убыванию
  - `latency_p50_ms`, `latency_p95_ms`, `latency_p99_ms` — по `latency_ms` в окне, 0 если строк нет
  - `total_checks`, `period_hours`
- `GET /api/stats/timeline?hours=24` (max 168): непрерывный ряд часов от `now-hours` до текущего часа, даже если в часе ноль событий. Поля item: `hour` (ISO), `allow`, `confirm`, `block`, `total`, `avg_latency_ms`
- Оба эндпоинта: `require_roles("admin", "sre")`

**Критерий готовности:**
```bash
curl -s "http://localhost:8081/api/stats" -H "Authorization: Bearer $ADMIN"
# есть by_decision.block (число), latency_p95_ms, top_categories (массив), period_hours
curl -s "http://localhost:8081/api/stats/timeline?hours=24" -H "Authorization: Bearer $ADMIN"
# items.length == 24
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/api/stats -H "Authorization: Bearer $DEV"
# → 403
```

---

### INT-015: Подключить Dashboard
**Время:** 15 мин | **Результат:** Карточки, бар-чарт и топ категорий читают `/api/stats` и `/api/stats/timeline`

**Шаги:**
- `getStats` → `apiClient.get<StatsResponse>('/api/stats')`
- `getTimeline` → `apiClient.get<TimelineResponse>('/api/stats/timeline', { params: { hours } })`
- `DashboardPage` не менять, если ключи из INT-014 на месте. `refetchInterval: 30_000` уже стоит
- После проверки на `/` дашборд может отставать на интервал рефетча — это нормально. Принудительный refetch при маунте уже есть (`refetchOnMount: 'always'`)

**Критерий готовности:**
```bash
# admin открывает /dashboard → «Всего проверок» равно total из curl /api/stats, не длине MOCK_LOGS (их было 7)
# график рисуется без ошибки в консоли, часы идут слева направо
# пустая БД → нули и пустой топ, без белого экрана
# developer пункт «Дашборд» в сайдбаре не видит (это уже в Layout). Прямой заход на /dashboard при желании оставить: API ответит 403, страница показывает «Не удалось загрузить статистику»
```

---

### INT-016: Снять моки и пройти сквозной сценарий
**Время:** 30 мин | **Результат:** `api.ts` не содержит фиктивных журналов, политик и сессий; один пользовательский сценарий проходит на живых сервисах

После INT-004…INT-015 в `api.ts` ещё лежат `MOCK_LOGS`, `MOCK_SESSIONS`, `MOCK_POLICY`, `localStorage`-гидратация и `requireAuth()`. Они больше не должны кормить страницы.

**Шаги:**
- Удалить мок-данные, `hydrateMocks`, `persistMocks`, `recordSessionCheck`, `DEMO_CREDENTIALS`, `requireAuth` и комментарии `Real:`, если функция уже ходит в сеть
- Оставить: `apiClient`, `mlClient`, interceptors, `getAuthHeaders`, `logout`, все экспортируемые функции из списка ниже
- Пройти сценарий руками (или curl + браузер) и поправить только то, что всплыло на стыке. Новые фичи не добавлять

Сценарий:
1. `dev_user` логинится → в сайдбаре нет «Политика» и «Дашборд»
2. `POST /v1/check` с его `user_id` → строка видна ему в `/logs` и **не** видна, если зайти другим developer (второго нет — проверить admin видит строку, а фильтр developer не показывает чужой `user_id`)
3. `admin` логинится → `/policy` сохраняет мелкую правку комментария, `reload_status=ok`, `/health` ml-service показывает новую `policy_version`
4. `admin` создаёт сессию с `max_requests=3`, шлёт 3 промпта с этой сессией со страницы `/` → карточка диалога содержит 3 сообщения, статус `closed`
5. Три block подряд в одной сессии → у третьего сообщения баннер многошаговой атаки
6. `confirm` на опасном, но легитимном промпте → статус `approved` в drawer
7. Выход → `guard_*` пусты, `/logs` редиректит на логин
8. `POST /v1/check` без токена по-прежнему 200

**Критерий готовности:**
```bash
cd AI-Guard/frontend && npm run build
# tsc без ошибок
# rg -n "MOCK_LOGS|mock-jwt-token|requireAuth" AI-Guard/frontend/src → пусто
# сценарий из шагов 1–8 проходит
```

---

## Порядок выполнения

| Этап | Задачи | Цель |
|------|--------|------|
| 1. Транспорт | INT-001 → INT-002 → INT-003 | Порты контракта, backend не падает на ML URL, Vite и nginx бьют в одни пути |
| 2. Вход | INT-004 | Живой JWT, id `u-admin-001` / `u-sre-001` / `u-dev-001` |
| 3. Журнал | INT-005 → INT-006 → INT-007 | Список, карточка, CSV, строка появляется сразу после `/v1/check` |
| 4. Подтверждение | INT-008 | Кнопки confirm пишут `confirmation_status` |
| 5. Политика | INT-009 → INT-010 | Один YAML с ML, 400/422, hot-reload |
| 6. Сессии | INT-011 → INT-012 → INT-013 | Счётчик, лимит, multi-step, страницы сессий |
| 7. Дашборд | INT-014 → INT-015 | Полная статистика и график |
| 8. Зачистка | INT-016 | Моков нет, сквозной сценарий зелёный |

INT-003 стоит до перевода страниц на сеть: иначе `npm run dev` не увидит `/api`. INT-007 стоит сразу после журнала: без него таблица после INT-006 останется пустой.

## Что на каком шаге оживает

| Экран | Ждёт задачи | Эндпоинт |
|-------|-------------|----------|
| `/login` | INT-004 | `POST /auth/login` |
| `/` проверка | INT-007 | `POST /v1/check` → ml-service |
| `/` кнопки подтверждения | INT-008 | `POST /api/confirm` |
| `/` выбор сессии | INT-013 | `POST /api/sessions` + `session_id` в `/v1/check` |
| `/logs` | INT-005, INT-006 | `GET /api/logs`, `GET /api/logs/{id}`, `GET /api/logs/export.csv` |
| `/policy` | INT-009, INT-010 | `GET/PUT /api/policy`, `GET /api/policy/history` → ML `POST /internal/reload-policy` |
| `/sessions`, `/sessions/:id` | INT-011, INT-012, INT-013 | `POST/GET /api/sessions`, `GET /api/sessions/{id}` |
| `/dashboard` | INT-014, INT-015 | `GET /api/stats`, `GET /api/stats/timeline` |

## Расхождения, которые задачи закрывают

| Место | Сейчас | Как должно быть |
|-------|--------|-----------------|
| Порт backend | 8000 в Dockerfile и compose, nginx ждёт 8081 | 8081 везде, ml `BACKEND_URL=http://backend:8081` |
| `POST /v1/check` | UI через nginx на ML; backend дублирует шлюз и тоже пишет в `checks` | Пишет только `POST /internal/checks` |
| Лог от ML | нет `user_id`/`user_role`/`user_name`, отправка фоном | поля из context, запись до ответа клиенту |
| Id пользователей | мок `usr_admin_001` | `u-admin-001`, `u-sre-001`, `u-dev-001` |
| Статус подтверждения | фронт читает `confirm_status`, колонка `confirmation_status`, список её не отдаёт | в JSON `confirm_status`, NULL → `"pending"` |
| Политика | backend требует `roles`, ML требует `agents`+`decisions`+`always_block`, reload фиктивный | один YAML, 400/422, реальный reload |
| Сессии | модель без API и без `check_sessions` | INT-011…INT-013 |
| Статистика | дырявый `by_decision`, нет timeline | полные нули и 24 бакета |
| `api.ts` | все функции — мок, комментарий `Real:` | INT-016 удаляет мок |

## Привязка к бонусам ТЗ

| Бонус | Баллы | Задачи |
|-------|-------|--------|
| Журнал с фильтрами | +2б | INT-005, INT-006 |
| Версия политики | +1б | INT-009, INT-010 |
| Изменение политики с валидацией и hot-reload | +2б | INT-009, INT-010 |
| История диалогов | +2б | INT-011, INT-012, INT-013 |
| Многошаговые атаки | +2б | INT-011, INT-013 |
| Лимиты сессий | +1б | INT-011, INT-013 |
| JWT (демо) | — | INT-004, уже сделанные FE-013…FE-015 и BE-022…BE-024 |
