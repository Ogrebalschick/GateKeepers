# Tasks — Backend-инженер (backend:8081)

> **Стек:** Python 3.11 · FastAPI · uvicorn · SQLAlchemy 2.0 (async) · aiomysql · Alembic · Pydantic v2 · httpx.AsyncClient · pydantic-settings · **PyJWT** · **passlib[bcrypt]**  
> **JSON-схемы всех эндпоинтов:** → `api-contract.md`  
> **Каждая задача:** 15–30 мин вайбкодинга с AI-агентом. Скопируй задачу как промпт — она самодостаточна.

---

### BE-001: Инициализация Python FastAPI backend-сервиса
**Время:** 20 мин | **Результат:** Сервис стартует на порту 8081, `/health` возвращает 200

**Шаги:**
- Создать структуру: `backend/app/models/`, `app/repositories/`, `app/services/`, `app/routers/`, `app/schemas/`
- `requirements.txt`: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]>=2.0`, `aiomysql`, `alembic`, `pydantic>=2`, `pydantic-settings`, `httpx`, `python-multipart`, `pyyaml`
- `app/main.py`: FastAPI app + CORSMiddleware (`allow_origins=["*"]`)
- `GET /health` → `{"status": "ok", "version": "1.0.0", "policy_version": 1}`
- `Dockerfile`: `FROM python:3.11-slim`, `pip install -r requirements.txt`, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8081`

**Критерий готовности:**
```bash
docker build -t backend . && docker run -p 8081:8081 backend
curl localhost:8081/health
# → {"status":"ok"}
```

---

### BE-002: Конфигурация через pydantic-settings
**Время:** 15 мин | **Результат:** Все настройки из `.env` / переменных окружения

**Шаги:**
- `app/config.py` — класс `Settings(BaseSettings)`:
  - `DB_HOST: str = "db"`, `DB_PORT: int = 3306`, `DB_NAME: str = "guarddb"`
  - `DB_USER: str = "guard"`, `DB_PASSWORD: str`
  - `ML_SERVICE_URL: str = "http://ml-service:8000"`
  - `DATABASE_URL` — computed property: `f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"`
- `.env.example` с переменными (без секретных значений)
- Singleton `get_settings()` через `@lru_cache`

**Критерий готовности:**
```python
from app.config import get_settings
s = get_settings()
assert s.DATABASE_URL.startswith("mysql+aiomysql://")
```

---

### BE-003: SQLAlchemy — модель Check
**Время:** 20 мин | **Результат:** ORM-модель для хранения результатов проверок

**Шаги:**
- `app/models/check.py` — класс `Check(Base)`, таблица `checks`:
  - `id: Mapped[int]` (PK, autoincrement)
  - `check_id: Mapped[str]` (UUID, unique, indexed)
  - `created_at: Mapped[datetime]` (server_default=func.now(), indexed)
  - `user_prompt: Mapped[str]` (Text)
  - `context_json: Mapped[str]` (Text)
  - `user_role: Mapped[str]` (indexed)
  - `user_id: Mapped[str]` (indexed)
  - `user_name: Mapped[str]`
  - `decision: Mapped[str]` (indexed)
  - `risk_level: Mapped[str]` (indexed)
  - `risk_category: Mapped[str]` (indexed)
  - `explanation: Mapped[str]` (Text)
  - `latency_ms: Mapped[float]`
  - `pipeline_layer: Mapped[str]`
  - `policy_version: Mapped[int]`
  - `session_id: Mapped[str | None]` (nullable, indexed)
  - `confirmation_status: Mapped[str | None]` (nullable)
  - `confirmed_at: Mapped[datetime | None]` (nullable)
  - `confirmed_by: Mapped[str | None]` (nullable)

**Критерий готовности:**
Alembic autogenerate видит модель и создаёт таблицу с индексами на `decision`, `risk_level`, `created_at`

---

### BE-004: SQLAlchemy — модели PolicyVersion и Session
**Время:** 20 мин | **Результат:** ORM-модели для версий политики и сессий диалогов

**Шаги:**
- `app/models/policy_version.py` — класс `PolicyVersion(Base)`, таблица `policy_versions`:
  - `id: Mapped[int]`, `version: Mapped[int]` (unique), `content_yaml: Mapped[str]` (Text)
  - `created_at: Mapped[datetime]`, `updated_by: Mapped[str]`, `comment: Mapped[str | None]`
  - `is_active: Mapped[bool]` (default False)
- `app/models/session.py` — класс `GuardSession(Base)`, таблица `sessions`:
  - `id: Mapped[int]`, `session_id: Mapped[str]` (UUID, unique)
  - `created_at: Mapped[datetime]`, `user_id: Mapped[str | None]`, `user_role: Mapped[str | None]`
  - `max_requests: Mapped[int]` (default 100), `request_count: Mapped[int]` (default 0)
  - `status: Mapped[str]` (default "active"), `last_activity_at: Mapped[datetime]`
  - `threat_flags_json: Mapped[str]` (Text, JSON-массив строк)
- `app/models/check_session.py` — класс `CheckSession(Base)`, таблица `check_sessions`:
  - `id: Mapped[int]`, `session_id: Mapped[str]` (FK→sessions.session_id), `check_id: Mapped[str]` (FK→checks.check_id)
  - `message_index: Mapped[int]`, `is_multi_step_attack: Mapped[bool]` (default False)

**Критерий готовности:**
Alembic autogenerate видит все 3 модели

---

### BE-005: Alembic — миграции
**Время:** 20 мин | **Результат:** Схема БД создаётся детерминированно при старте

**Шаги:**
- `alembic init alembic` в папке backend
- Настроить `alembic.ini` и `env.py` для async SQLAlchemy: использовать `run_async_migrations()`
- `alembic revision --autogenerate -m "initial schema"` → создаёт таблицы checks, policy_versions, sessions, check_sessions
- Добавить индексы вручную в миграцию если autogenerate их не подхватил: `checks(decision)`, `checks(risk_level)`, `checks(created_at)`, `checks(session_id)`
- В `app/main.py` при старте (`@app.on_event("startup")`): запустить `alembic upgrade head`

**Критерий готовности:**
```bash
docker-compose up db backend
# В логах backend: "INFO  [alembic.runtime.migration] Running upgrade -> XXXX"
# В MariaDB: SHOW TABLES → checks, policy_versions, sessions, check_sessions
```

---

### BE-006: SQLAlchemy — async database session
**Время:** 15 мин | **Результат:** Общий async session factory для всех репозиториев

**Шаги:**
- `app/database.py`:
  - `create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)`
  - `AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)`
  - Зависимость FastAPI `get_db() -> AsyncGenerator[AsyncSession, None]`

**Критерий готовности:**
```python
async with AsyncSessionLocal() as session:
    result = await session.execute(text("SELECT 1"))
    assert result.scalar() == 1
```

---

### BE-007: Репозиторий CheckRepository
**Время:** 25 мин | **Результат:** Все CRUD-операции с таблицей checks

**Шаги:**
- `app/repositories/check_repository.py`
- `save(session, data: dict) -> Check`
- `find_all(session, filters: dict, page: int, per_page: int) -> tuple[list[Check], int]`:
  - Динамические `where()` по decision, risk_level, risk_category, user_id, user_role, date_from, date_to, search (LIKE)
  - `COUNT(*)` для total + SELECT с LIMIT/OFFSET
- `find_by_id(session, id: int) -> Check | None`
- `find_by_check_id(session, check_id: str) -> Check | None`
- `update_confirmation(session, check_id: str, user_decision: str, user_id: str) -> Check`
- `get_latency_percentiles(session, period_hours: int) -> dict` — нативный SQL `PERCENTILE_CONT` или ручная сортировка

**Критерий готовности:**
```python
# Вставить 5 записей, 3 с decision=block:
results, total = await check_repo.find_all(session, {"decision": "block"}, 1, 50)
assert total == 3
```

---

### BE-008: Репозиторий PolicyRepository + SessionRepository
**Время:** 20 мин | **Результат:** CRUD для политики и сессий

**Шаги:**
- `app/repositories/policy_repository.py`:
  - `get_active(session) -> PolicyVersion | None`
  - `create(session, yaml_content, updated_by, comment) -> PolicyVersion` (deactivates old, creates new)
  - `get_all(session) -> list[PolicyVersion]`
- `app/repositories/session_repository.py`:
  - `create(session, data: dict) -> GuardSession`
  - `find_by_session_id(session, sid: str) -> GuardSession | None`
  - `find_all(session, filters: dict, page: int, per_page: int) -> tuple[list, int]`
  - `increment_request_count(session, sid: str) -> GuardSession`
  - `add_check_to_session(session, sid: str, check_id: str, is_attack: bool)`

**Критерий готовности:**
```python
# Создать PolicyVersion v1, затем v2 → v1.is_active=False, v2.is_active=True
v1 = await policy_repo.get_active(session)
assert v1.version == 1
```

---

### BE-009: Инициализация политики при старте
**Время:** 15 мин | **Результат:** При первом запуске БД заполняется версией политики из файла

**Шаги:**
- В `app/main.py` при `@app.on_event("startup")`:
  - Проверить `policy_repository.get_active(session)` — если None:
    - Прочитать `astra_public_v2/security_policy.yaml` из `app/resources/security_policy.yaml`
    - Создать PolicyVersion v1 с `updated_by="system"`, `is_active=True`
- Добавить файл `app/resources/security_policy.yaml` (копия из `astra_public_v2/`)

**Критерий готовности:**
```bash
# Первый запуск контейнера:
curl http://localhost:8081/api/policy
# → {"version":1,"content_yaml":"version: 1\n..."}
```

---

### BE-010: Роутер /internal/checks — приём логов от ML
**Время:** 15 мин | **Результат:** ML-сервис может логировать проверки в БД

> **JSON-схема:** → `api-contract.md` → раздел `Внутренние эндпоинты`

**Шаги:**
- `app/routers/internal.py` — `APIRouter(prefix="/internal")`
- Pydantic-схема `CheckSaveRequest` со всеми полями из контракта
- `POST /internal/checks`: принять запрос → `check_repository.save()` → если `session_id` не None → `session_repository.increment_request_count()` + `add_check_to_session()` → вернуть 201 `{"ok": true}`
- Определять `is_multi_step_attack`: если для данной сессии 3+ последних решений = `block` → True
- Добавить роутер в `main.py`

**Критерий готовности:**
```bash
curl -s -X POST http://localhost:8081/internal/checks \
  -H "Content-Type: application/json" \
  -d '{"check_id":"uuid-001","created_at":"2026-11-21T10:00:00Z","user_prompt":"test","context_json":"{}","decision":"block","risk_level":"high","risk_category":"jailbreak","explanation":"test","latency_ms":10.0,"pipeline_layer":"layer0","policy_version":1,"session_id":null}'
# → 201 {"ok":true}
curl http://localhost:8081/api/logs
# → items[0].check_id == "uuid-001"
```

---

### BE-011: Роутер GET /api/logs + GET /api/logs/{id} + GET /api/logs/export.csv
**Время:** 25 мин | **Результат:** Журнал с фильтрацией и пагинацией (+2б бонус)

> **JSON-схемы:** → `api-contract.md` → разделы `GET /api/logs`, `GET /api/logs/{id}`

**Шаги:**
- `app/routers/logs.py` — `APIRouter(prefix="/api")`
- Pydantic-схемы `CheckListItem`, `CheckListResponse`, `CheckDetail`
- `GET /api/logs`: Query-параметры → `check_repository.find_all()` → `CheckListResponse`
  - `user_prompt` обрезать до 200 символов в схеме
- `GET /api/logs/{id}`: `check_repository.find_by_id()` → `CheckDetail` / 404
- `GET /api/logs/export.csv`: те же фильтры → StreamingResponse с CSV
  - Заголовок `Content-Disposition: attachment; filename="guard_logs_{date}.csv"`
  - Колонки: id, created_at, user_role, decision, risk_level, risk_category, latency_ms, pipeline_layer

**Критерий готовности:**
```bash
curl "http://localhost:8081/api/logs?decision=block&per_page=5"
# → {"items":[...],"total":N,"pages":M}
curl "http://localhost:8081/api/logs/export.csv" -o logs.csv
# → CSV файл скачан
```

---

### BE-012: Роутер GET/PUT /api/policy + история (+3б бонус)
**Время:** 25 мин | **Результат:** Просмотр, обновление политики и уведомление ML о hot-reload

> **JSON-схемы:** → `api-contract.md` → разделы `GET /api/policy`, `PUT /api/policy`

**Шаги:**
- `app/services/policy_service.py`:
  - `get_active() -> PolicyVersion`
  - `update(yaml_content: str, updated_by: str, comment: str | None) -> dict`:
    - Парсить YAML через `pyyaml.safe_load()` — при ошибке → 400 `invalid_yaml`
    - Проверить обязательные поля (`always_block`, `agents`, `decisions`) — при отсутствии → 422 `schema_violation`
    - `policy_repository.create()` → новая версия
    - Вызвать `ml_client.reload_policy(yaml_content, new_version)` → `reload_status`
- `app/routers/policy.py` — `APIRouter(prefix="/api")`
- `GET /api/policy` → `PolicyResponse`
- `PUT /api/policy` → валидация → `policy_service.update()` → `PolicyUpdateResponse`
- `GET /api/policy/history` → список версий без `content_yaml`

**Критерий готовности:**
```bash
curl -X PUT http://localhost:8081/api/policy \
  -H "Content-Type: application/json" \
  -d '{"content_yaml":"version: 2\nalways_block:\n  - jailbreak\nagents: {}\ndecisions: {}","comment":"test","updated_by":"u-1"}'
# → {"version":2,"reload_status":"ok"}
curl http://localhost:8081/api/policy/history
# → {"items":[{"version":1,...},{"version":2,...}]}
```

---

### BE-013: Роутер POST /api/confirm
**Время:** 15 мин | **Результат:** Подтверждение действий с защитой от двойного подтверждения

> **JSON-схема:** → `api-contract.md` → раздел `POST /api/confirm`

**Шаги:**
- В `app/routers/logs.py` или отдельном `app/routers/confirm.py`
- `POST /api/confirm`: принять `ConfirmRequest` → найти check → если нет → 404 → если уже подтверждён → 409 → `check_repository.update_confirmation()` → 200 `ConfirmResponse`
- Pydantic-схемы `ConfirmRequest` и `ConfirmResponse`

**Критерий готовности:**
```bash
# Создать check через /internal/checks, затем:
curl -X POST http://localhost:8081/api/confirm \
  -d '{"check_id":"uuid-001","user_decision":"approved","user_id":"u-1","comment":null}'
# → 200
# Повторный вызов:
# → 409 {"error":"already_confirmed"}
```

---

### BE-014: Роутер GET /api/stats + /api/stats/timeline
**Время:** 20 мин | **Результат:** Агрегированная статистика для дашборда

> **JSON-схемы:** → `api-contract.md` → разделы `GET /api/stats`, `GET /api/stats/timeline`

**Шаги:**
- `app/services/stats_service.py`:
  - `get_stats(period_hours: int) -> dict`: GROUP BY запросы через SQLAlchemy Core — by_decision, by_risk_level, top_categories, percentiles latency
  - `get_timeline(hours: int) -> list[dict]`: GROUP BY `DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z')` за последние N часов
  - Кэш на 60 секунд (простой `time.time()` кэш или `cachetools.TTLCache`)
- `app/routers/stats.py` — `GET /api/stats?period_hours=24` и `GET /api/stats/timeline?hours=24`

**Критерий готовности:**
```bash
curl "http://localhost:8081/api/stats"
# → {"total_checks":N,"by_decision":{"block":M,...},"latency_p95_ms":X}
```

---

### BE-015: Sessions API — POST/GET /api/sessions (бонус +5б)
**Время:** 25 мин | **Результат:** Создание и просмотр сессий диалогов

> **JSON-схемы:** → `api-contract.md` → разделы `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{id}`

**Шаги:**
- `app/services/session_service.py`:
  - `create(data: dict) -> GuardSession`
  - `find_all(filters, page, per_page) -> tuple[list, int]`
  - `find_by_session_id(sid: str) -> dict` — сессия + список messages из `check_sessions JOIN checks`
  - `close_if_limit_exceeded(sid: str)` — если `request_count >= max_requests` → `status="closed"`
- `app/routers/sessions.py` — `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{id}`
- В BE-010: после `increment_request_count()` вызывать `close_if_limit_exceeded()`

**Критерий готовности:**
```bash
curl -X POST http://localhost:8081/api/sessions \
  -d '{"user_id":"u-1","user_role":"admin","max_requests":5}'
# → {"session_id":"uuid-sess-001","status":"active"}

# Добавить 5 проверок через /internal/checks с session_id="uuid-sess-001"
curl http://localhost:8081/api/sessions/uuid-sess-001
# → {"status":"closed","request_count":5,"messages":[...5 сообщений...]}
```

---

### BE-016: HTTP-клиент к ML-сервису
**Время:** 15 мин | **Результат:** Компонент для уведомления ML о смене политики

**Шаги:**
- `app/services/ml_client.py`
- `reload_policy(yaml_content: str, version: int) -> bool`:
  - `httpx.AsyncClient.post(ML_SERVICE_URL + "/internal/reload-policy", json={...}, timeout=5.0)`
  - True при 200, False при любой ошибке (логировать, не пробрасывать)
- `ML_SERVICE_URL` из `get_settings()`

**Критерий готовности:**
```python
result = await ml_client.reload_policy("version: 2\n...", 2)
# → True когда ML запущен, False когда не запущен (без exception)
```

---

### BE-017: Global Exception Handlers
**Время:** 15 мин | **Результат:** Единый формат ошибок `{"error": "...", "detail": "..."}`

**Шаги:**
- В `app/main.py` добавить `@app.exception_handler` для:
  - `404 HTTPException` → `{"error": "not_found"}`
  - Кастомное `InvalidYamlError` → 400 `{"error": "invalid_yaml", "detail": "..."}`
  - Кастомное `SchemaViolationError` → 422 `{"error": "schema_violation", "detail": "..."}`
  - Кастомное `AlreadyConfirmedError` → 409 `{"error": "already_confirmed", "detail": "..."}`
- Создать `app/exceptions.py` с этими классами

**Критерий готовности:**
```bash
curl http://localhost:8081/api/logs/999999
# → 404 {"error":"not_found"}
curl -X PUT http://localhost:8081/api/policy -d '{"content_yaml":"!!!invalid yaml:::"}'
# → 400 {"error":"invalid_yaml"}
```

---

### BE-018: Dockerfile backend
**Время:** 15 мин | **Результат:** Docker-образ backend собирается

**Шаги:**
- Multi-stage `Dockerfile`:
  - `FROM python:3.11-slim`
  - `apt-get install gcc` (для aiomysql)
  - `COPY requirements.txt .` → `pip install --no-cache-dir -r requirements.txt`
  - `COPY app/ ./app/`
  - `COPY alembic/ ./alembic/` и `alembic.ini`
  - `COPY astra_public_v2/security_policy.yaml ./app/resources/security_policy.yaml`
  - `ENV DB_HOST=db DB_PORT=3306 DB_NAME=guarddb`
  - `EXPOSE 8081`
  - `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]`

**Критерий готовности:**
```bash
docker build -t backend backend/
# Сборка без ошибок
```

---

### BE-019: docker-compose.yml — все 5 сервисов
**Время:** 25 мин | **Результат:** `docker-compose up` поднимает всё одной командой

**Шаги:**
- Сервис `db`: `image: mariadb:11`, volume `db_data:/var/lib/mysql`, env `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE=guarddb`, `MYSQL_USER`, `MYSQL_PASSWORD`, healthcheck: `mysqladmin ping -h localhost`
- Сервис `backend`: `build: ./backend`, `depends_on: {db: {condition: service_healthy}}`, env из `.env`, `ports: ["8081:8081"]`
- Сервис `ml-service`: `build: ./ml-service`, `depends_on: [llama]`, env `LLAMA_URL=http://llama:8080` и `BACKEND_URL=http://backend:8081`, volume `./models:/app/models`, `ports: ["8000:8000"]`
- Сервис `llama`: образ из `llama-service/Dockerfile` или `ghcr.io/ggerganov/llama.cpp:server`, volume `./models:/models`, command `./server -m /models/qwen3guard.gguf --port 8080 --gpu-layers 999 --host 0.0.0.0 --ctx-size 2048`, `ports: ["8080:8080"]`
- Сервис `frontend`: `build: ./frontend`, `depends_on: [backend, ml-service]`, `ports: ["80:80"]`
- `networks: guard_net` — все сервисы в одной сети
- `.env.example` с переменными: `DB_PASSWORD`, `DB_USER`, `DB_ROOT_PASSWORD`

**Критерий готовности:**
```bash
cp .env.example .env  # заполнить пароли
docker-compose up --build
# Все 5 сервисов стартовали:
curl http://localhost:8000/health && curl http://localhost:8081/health && curl http://localhost:80
```

---

---

### BE-021: JWT-инфраструктура и зависимости
**Время:** 20 мин | **Результат:** Библиотеки установлены, утилиты auth готовы к использованию

**Шаги:**
- Добавить в `requirements.txt`: `PyJWT>=2.8`, `passlib[bcrypt]`
- Добавить в `.env.example`: `JWT_SECRET=change_me_in_production`, `JWT_EXPIRATION=86400`, `ADMIN_PASSWORD=demo_admin_2026`, `SRE_PASSWORD=demo_sre_2026`, `DEV_PASSWORD=demo_dev_2026`
- Добавить в `app/config.py` (класс `Settings`): `JWT_SECRET: str`, `JWT_EXPIRATION: int = 86400`, `ADMIN_PASSWORD: str = "demo_admin_2026"`, `SRE_PASSWORD: str = "demo_sre_2026"`, `DEV_PASSWORD: str = "demo_dev_2026"`
- `app/utils/auth.py` — описание функций (без реализации):
  - `create_access_token(user_id: str, role: str) -> str` — создаёт JWT с `exp = now + JWT_EXPIRATION`
  - `decode_token(token: str) -> dict` — декодирует JWT, проверяет подпись и `exp`; при ошибке → `AuthError`
  - `hash_password(password: str) -> str` — bcrypt хэш
  - `verify_password(plain: str, hashed: str) -> bool` — сравнение bcrypt
- `app/utils/users.py` — хранилище пользователей:
  - Класс `User(BaseModel)`: `user_id`, `username`, `hashed_password`, `role`
  - Функция `get_users() -> list[User]` — возвращает 3 предопределённых пользователя из `Settings`; пароли хэшируются при первом вызове и кэшируются
  - Функция `get_user_by_username(username: str) -> User | None`

**Критерий готовности:**
```bash
cd backend && pip install -r requirements.txt
python -c "import jwt; import passlib; print('JWT:', jwt.__version__, 'passlib OK')"
```

---

### BE-022: FastAPI Dependency — проверка JWT
**Время:** 30 мин | **Результат:** Все `/api/*` требуют валидный токен; `/v1/check` и `/internal/*` — нет

> **КРИТИЧНО:** `/v1/check` вызывает `evaluate.py` без токена. Если добавить auth на этот эндпоинт — Score = 0.

**Шаги:**
- `app/dependencies/auth.py`:
  - Pydantic-схема `CurrentUser`: `user_id: str`, `role: str`
  - Dependency `get_current_user(authorization: str = Header(None)) -> CurrentUser`:
    - Если заголовок отсутствует → 401 `{"error": "unauthorized", "detail": "Missing token"}`
    - Извлечь токен: `authorization.removeprefix("Bearer ").strip()`
    - Вызвать `decode_token(token)` → при `AuthError(expired)` → 401 `{"error": "token_expired"}` → при `AuthError(invalid)` → 401 `{"error": "unauthorized"}`
    - Вернуть `CurrentUser(user_id=payload["user_id"], role=payload["role"])`
  - Dependency-фабрика `require_role(*roles: str)`:
    - Принимает список допустимых ролей
    - Возвращает зависимость, которая вызывает `get_current_user`, затем проверяет роль
    - При несоответствии → 403 `{"error": "forbidden", "detail": "Требуется роль: admin"}`
- В каждом `/api/*` роутере добавить `Depends(get_current_user)` на уровне `APIRouter(dependencies=[...])`
- Роутер `/v1/check` — **без** `Depends(get_current_user)`
- Роутер `/internal/*` — **без** `Depends(get_current_user)`
- `PUT /api/policy` — дополнительно `Depends(require_role("admin"))`
- `GET /api/stats`, `GET /api/stats/timeline` — `Depends(require_role("admin", "sre"))`

**Критерий готовности:**
```bash
# Без токена → 401
curl http://localhost:8081/api/logs
# → 401 {"error":"unauthorized"}

# С токеном → 200
curl http://localhost:8081/api/logs -H "Authorization: Bearer $VALID_TOKEN"
# → 200 {"items":[...]}

# evaluate.py работает без токена — КРИТИЧНО
python astra_public_v2/evaluate.py --data astra_public_v2/dev.jsonl \
  --endpoint http://localhost:8000/v1/check
# → score должен остаться прежним
```

---

### BE-023: Эндпоинт POST /auth/login
**Время:** 25 мин | **Результат:** Аутентификация, возврат JWT-токена

> **JSON-схема:** → `api-contract.md` → раздел `POST /auth/login`

**Шаги:**
- `app/routers/auth.py` — `APIRouter(prefix="/auth")`
- Pydantic-схемы `LoginRequest` и `LoginResponse`
- `POST /auth/login`:
  1. `get_user_by_username(request.username)` → если None → 401 (не раскрывать причину)
  2. `verify_password(request.password, user.hashed_password)` → если False → 401
  3. `create_access_token(user.user_id, user.role)` → вернуть `LoginResponse`
- Добавить роутер в `app/main.py` **без** dependency `get_current_user`
- Убедиться что CORS разрешает `/auth/login` из любого origin

**Критерий готовности:**
```bash
# Успешный логин
curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"demo_admin_2026"}'
# → {"access_token":"eyJ...","token_type":"bearer","expires_in":86400,"user_id":"u-admin-001","role":"admin"}

# Неверный пароль
curl -s -X POST http://localhost:8081/auth/login \
  -d '{"username":"admin","password":"wrong"}'
# → 401 {"error":"invalid_credentials"}

# Токен работает на /api/logs
TOKEN=$(curl -s ... | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl http://localhost:8081/api/logs -H "Authorization: Bearer $TOKEN"
# → 200
```

---

### BE-024: Role-based фильтрация данных
**Время:** 20 мин | **Результат:** `developer` видит только свои записи автоматически

**Шаги:**
- В `GET /api/logs`: если `current_user.role == "developer"` → принудительно добавить `filters["user_id"] = current_user.user_id` (даже если в query params указан другой user_id)
- В `GET /api/sessions`: если `current_user.role == "developer"` → фильтровать по `user_id = current_user.user_id`
- В `GET /api/sessions/{id}`: если `current_user.role == "developer"` и сессия не принадлежит пользователю → 403
- Добавить `app/exceptions.py` класс `ForbiddenError` → handler вернёт 403 `{"error": "forbidden", "detail": "..."}`
- Убедиться что `updated_by` в `PUT /api/policy` берётся из `current_user.user_id` (не из тела запроса)

**Критерий готовности:**
```bash
# Создать 2 записи: одну от u-admin-001, другую от u-dev-001
# Запрос developer-токена на /api/logs → только одна запись
curl http://localhost:8081/api/logs -H "Authorization: Bearer $DEV_TOKEN"
# → {"items":[...1 запись...],"total":1}

# developer пытается PUT /api/policy → 403
curl -X PUT http://localhost:8081/api/policy \
  -H "Authorization: Bearer $DEV_TOKEN" -d '...'
# → 403 {"error":"forbidden","detail":"Требуется роль: admin"}
```

---

## Порядок выполнения

| Этап | Задачи | Когда | Цель |
|------|--------|-------|------|
| Ночь 1 | BE-001 → BE-002 → **BE-021** | 22:00–24:00 | backend стартует, JWT-утилиты готовы |
| День 2 утро | BE-003..BE-010 → **BE-022 → BE-023** | 09:00–12:00 | ML логирует, auth работает |
| День 2 день | BE-011..BE-017 → **BE-024** | 12:00–15:00 | Все /api/* + роли |
| День 2 вечер | BE-018 → BE-019 | 15:00–17:00 | docker-compose up готов |

## Привязка к бонусам ТЗ

| Бонус | Баллы | Задачи |
|-------|-------|--------|
| Журнал с фильтрами | +2б | BE-010, BE-011 |
| Версия политики | +1б | BE-009, BE-012 |
| Изменение политики с валидацией | +2б | BE-012 + AI-014 (reload) |
| История диалогов (изолированные сессии) | +2б | BE-015 |
| Многошаговые атаки | +2б | BE-010 (`is_multi_step_attack`), BE-015 |
| Лимиты сессий | +1б | BE-015 (`max_requests`) |
| **JWT-авторизация (демо)** | — | BE-021 → BE-022 → BE-023 → BE-024 |
