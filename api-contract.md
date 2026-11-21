# API Contract — ИИ-Сторож (Astra Guard)

> **Версия**: 2.0 | **Дата**: 2026-11-20  
> Единственный источник истины для интеграции Frontend ↔ Backend ↔ ML-сервис.  
> Персон-файлы (`tasks-ai.md`, `tasks-backend.md`, `tasks-frontend.md`) ссылаются на этот документ и **не дублируют** схемы.

---

## Архитектура сервисов

| Сервис | Порт | Технология | Владелец |
|--------|------|-----------|---------|
| `ml-service` | **8000** | Python FastAPI + uvicorn | AI-инженер |
| `backend` | **8081** | Python FastAPI + uvicorn | Backend |
| `frontend` | **80** | React + nginx | Frontend |
| `db` | 3306 | MariaDB 11 | Backend |
| `llama` | 8080 | llama.cpp server (HIP/ROCm) | AI-инженер |

---

## Авторизация

### Общие правила

| Эндпоинт | Авторизация |
|----------|------------|
| `POST /v1/check` | ❌ **Не требуется** — вызывает `evaluate.py`. Убрать auth = Score 0 |
| `POST /auth/login` | ❌ Не требуется — сам выдаёт токен |
| `GET/POST /internal/*` | ❌ Не требуется — только внутренняя сеть Docker |
| `GET /health` | ❌ Не требуется |
| Все `/api/*` | ✅ **Требуется** заголовок `Authorization: Bearer <jwt_token>` |

**JWT payload:** `{ "user_id": "string", "role": "string", "exp": "unix timestamp", "iat": "unix timestamp" }`  
**Срок жизни токена:** 24 часа (`exp = iat + 86400`)  
**Секрет:** хранится в переменной окружения `JWT_SECRET` (не в коде)

### Роли и права доступа

| Роль | Журнал | Политика | Сессии | Статистика |
|------|--------|----------|--------|-----------|
| `admin` | Все записи (read/write) | Полный доступ (read/write) | Все сессии | ✅ |
| `sre` | Все записи (read-only) | Только чтение | Все сессии | ✅ |
| `developer` | Только свои (`user_id` = своему) | ❌ Нет доступа | Только свои | ❌ |

**Правило для `GET /api/logs`:** `developer` автоматически получает фильтр `user_id = current_user.user_id` без возможности его обойти.  
**`PUT /api/policy`** — только `admin`, остальные → 403.

### Предопределённые пользователи (для демо и жюри)

| username | password (env var) | role | user_id |
|----------|--------------------|------|---------|
| `admin` | `ADMIN_PASSWORD` (default: `demo_admin_2026`) | admin | `u-admin-001` |
| `sre_user` | `SRE_PASSWORD` (default: `demo_sre_2026`) | sre | `u-sre-001` |
| `dev_user` | `DEV_PASSWORD` (default: `demo_dev_2026`) | developer | `u-dev-001` |

> Пароли по умолчанию задаются только в `.env.example`. В продакшне — обязательно переопределить через реальные env vars.

---

## Правило маршрутизации Nginx (frontend-контейнер)

> **Единственная точка входа снаружи — порт `80` контейнера `frontend`.**  
> Frontend-код использует `baseURL: ""` (пустой) — он не знает о портах 8081 и 8000.  
> Nginx сам решает, куда проксировать запрос.

```nginx
server {
    listen 80;
    server_name localhost;

    # ML-сервис: пайплайн проверок, вызывается evaluate.py и фронтендом
    location /v1/ {
        proxy_pass http://ml-service:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Backend API: журнал, политика, сессии, статистика, авторизация
    location /api/ {
        proxy_pass http://backend:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # /auth/ тоже идёт на backend (POST /auth/login)
    location /auth/ {
        proxy_pass http://backend:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # React SPA — всё остальное отдаём index.html (для React Router)
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
```

**Следствия для разработки:**

| Контекст | URL для обращения к ML |
|----------|------------------------|
| `docker-compose` (продакшн/демо) | `http://localhost:80/v1/check` или `http://<внешний-IP>/v1/check` |
| `evaluate.py` (оценщик) | `http://localhost:80/v1/check` (или `--endpoint http://<IP>/v1/check`) |
| `npm run dev` (локальная разработка) | Vite proxy на `localhost:5173` → настроить в `vite.config.ts` |

**Frontend `src/services/api.ts`:**
```ts
// apiClient — /api/* и /auth/*
const apiClient = axios.create({ baseURL: "" });   // ← пустой baseURL, Nginx сам маршрутизирует

// mlClient — /v1/*
const mlClient  = axios.create({ baseURL: "" });
```

---

## 💡 Важные нюансы для команды

### Для Frontend-инженера
В `src/services/api.ts` axios-инстансы создаются с **пустым `baseURL`** — Nginx сам разберёт, куда идти, по первому сегменту пути (`/v1` или `/api`):
```ts
import axios from 'axios';

// ✅ Правильно
const apiClient = axios.create({ baseURL: "" }); // /api/* и /auth/* → backend:8081
const mlClient  = axios.create({ baseURL: "" }); // /v1/*           → ml-service:8000

// ❌ Неправильно — хардкод ломает Docker
const apiClient = axios.create({ baseURL: "http://localhost:8081" });
```
Не добавляй переменные `REACT_APP_API_URL` / `VITE_API_URL` — они больше не нужны.

---

### Для Backend-инженера
В FastAPI (`backend`) обязательно включи CORS:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # при проксировании Nginx браузер видит один домен,
    allow_methods=["*"],       # но preflight OPTIONS всё равно требует явного разрешения
    allow_headers=["*"],
)
```
Слушай на `0.0.0.0`, а не `127.0.0.1`:
```bash
uvicorn main:app --host 0.0.0.0 --port 8081
```

---

### Для AI-инженера (ml-service)
ml-service **обязан** слушать `0.0.0.0:8000`, иначе Nginx не сможет достучаться из другого контейнера:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
В `docker-compose.yml` порт `8000` можно **не публиковать** наружу — достаточно внутренней Docker-сети. Nginx обращается к `http://ml-service:8000` по имени сервиса.

---

### Для запуска evaluate.py
После поднятия `docker-compose up --build` используй:
```bash
# Если маппинг портов 80:80
python evaluate.py --data dev.jsonl --endpoint http://localhost/v1/check

# Если маппинг портов 8080:80 (порт 80 занят на хосте)
python evaluate.py --data dev.jsonl --endpoint http://localhost:8080/v1/check

# На внешнем сервере / VPS
python evaluate.py --data dev.jsonl --endpoint http://<SERVER_IP>/v1/check
```

---

## Внутренние вызовы (не видны frontend)

| Инициатор | Вызывает | Когда |
|-----------|---------|-------|
| ml-service | `POST backend:8081/internal/checks` | После каждого `/v1/check` — логирование |
| backend | `POST ml-service:8000/internal/reload-policy` | После `PUT /api/policy` — hot-reload |

---

## Эндпоинты

---

### POST /v1/check
**Сервис:** `ml-service:8000` | **Вызывает:** `evaluate.py` и Frontend | **Авторизация:** ❌ Не требуется

#### Request
```json
{
  "user_prompt": "string",
  "context": {
    "target_agent": "string",
    "user_role": "string — 'developer' | 'sre' | 'admin'",
    "user_id": "string",
    "user_name": "string",
    "system_prompt": "string",
    "history": [{ "role": "string", "content": "string" }],
    "attachments": [{ "type": "string", "name": "string", "content": "string" }]
  },
  "session_id": "string | null"
}
```

#### Response 200
```json
{
  "decision": "string — 'allow' | 'confirm' | 'block'",
  "risk_level": "string — 'none' | 'low' | 'medium' | 'high' | 'critical'",
  "risk_category": "string — см. список ниже",
  "explanation": "string — 10–50 слов",
  "latency_ms": "number",
  "pipeline_layer": "string — 'layer0' | 'layer1' | 'layer2'",
  "check_id": "string — UUID"
}
```

#### Response 400
```json
{ "error": "invalid_input", "detail": "string" }
```

#### Допустимые значения `risk_category`
```
none | sensitive_action | unauthorized_data_access | tool_abuse
prompt_injection | jailbreak | indirect_injection
system_prompt_extraction | system_prompt_override | privilege_escalation
data_exfiltration | harmful_content | fraud_social_engineering | abuse
```

#### Пример — block
```json
{
  "decision": "block",
  "risk_level": "high",
  "risk_category": "jailbreak",
  "explanation": "Request attempts to override AI safety constraints via persona assignment.",
  "latency_ms": 8.1,
  "pipeline_layer": "layer0",
  "check_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

#### Пример — confirm
```json
{
  "decision": "confirm",
  "risk_level": "medium",
  "risk_category": "sensitive_action",
  "explanation": "Admin is restarting a production service. Requires explicit confirmation per policy.",
  "latency_ms": 12.3,
  "pipeline_layer": "layer0",
  "check_id": "550e8400-e29b-41d4-a716-446655440002"
}
```

---

### GET /api/logs
**Сервис:** `backend:8081` | **Бонус +2б (фильтры)** | **Авторизация:** ✅ Bearer JWT (admin/sre: все записи; developer: только свои)

#### Query Parameters
```
decision       — 'allow' | 'confirm' | 'block' | ''
risk_level     — 'none' | 'low' | 'medium' | 'high' | 'critical' | ''
risk_category  — любое значение из списка | ''
user_id        — string | '' (для developer игнорируется — подставляется автоматически)
user_role      — 'developer' | 'sre' | 'admin' | ''
date_from      — ISO 8601 | ''
date_to        — ISO 8601 | ''
search         — полнотекстовый по user_prompt | ''
page           — integer, default: 1
per_page       — integer, default: 50, max: 200
```

#### Response 200
```json
{
  "items": [
    {
      "id": "integer",
      "check_id": "string",
      "created_at": "string — ISO 8601",
      "user_prompt": "string — первые 200 символов",
      "user_role": "string",
      "user_id": "string",
      "user_name": "string",
      "decision": "string",
      "risk_level": "string",
      "risk_category": "string",
      "explanation": "string",
      "latency_ms": "number",
      "pipeline_layer": "string",
      "has_attachments": "boolean",
      "session_id": "string | null",
      "policy_version": "integer"
    }
  ],
  "total": "integer",
  "page": "integer",
  "per_page": "integer",
  "pages": "integer"
}
```

---

### GET /api/logs/{id}
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre: любой; developer: только свои)

#### Response 200
```json
{
  "id": "integer",
  "check_id": "string",
  "created_at": "string",
  "user_prompt": "string — полный текст",
  "context": {
    "target_agent": "string",
    "user_role": "string",
    "user_id": "string",
    "user_name": "string",
    "history_count": "integer",
    "attachments_count": "integer",
    "attachments": [{ "type": "string", "name": "string", "content_preview": "string — 500 символов" }]
  },
  "decision": "string",
  "risk_level": "string",
  "risk_category": "string",
  "explanation": "string",
  "latency_ms": "number",
  "pipeline_layer": "string",
  "policy_version": "integer",
  "session_id": "string | null"
}
```

#### Response 404
```json
{ "error": "not_found" }
```

---

### GET /api/logs/export.csv
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre)

Те же query params что у `GET /api/logs` (кроме page/per_page).

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="guard_logs_2026-11-20.csv"
```

---

### GET /api/policy
**Сервис:** `backend:8081` | **Бонус +1б (версия)** | **Авторизация:** ✅ Bearer JWT (admin/sre)

#### Response 200
```json
{
  "version": "integer",
  "content_yaml": "string — полный YAML",
  "created_at": "string",
  "updated_at": "string",
  "updated_by": "string",
  "comment": "string | null"
}
```

---

### PUT /api/policy
**Сервис:** `backend:8081` | **Бонус +2б (изменение с валидацией)** | **Авторизация:** ✅ Bearer JWT (только `admin` → 403 для остальных)

#### Request
```json
{
  "content_yaml": "string",
  "comment": "string | null",
  "updated_by": "string"
}
```

#### Response 200
```json
{
  "version": "integer",
  "content_yaml": "string",
  "updated_at": "string",
  "updated_by": "string",
  "comment": "string | null",
  "reload_status": "string — 'ok' | 'failed'"
}
```

#### Response 400 — невалидный YAML
```json
{ "error": "invalid_yaml", "detail": "string" }
```

#### Response 422 — схема нарушена
```json
{ "error": "schema_violation", "detail": "string" }
```

---

### GET /api/policy/history
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre)

#### Response 200
```json
{
  "items": [
    {
      "version": "integer",
      "updated_at": "string",
      "updated_by": "string",
      "comment": "string | null",
      "is_active": "boolean"
    }
  ]
}
```

---

### POST /api/confirm
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre/developer)

#### Request
```json
{
  "check_id": "string — UUID из /v1/check",
  "user_decision": "string — 'approved' | 'rejected'",
  "user_id": "string",
  "comment": "string | null"
}
```

#### Response 200
```json
{
  "check_id": "string",
  "user_decision": "string",
  "confirmed_at": "string",
  "confirmed_by": "string"
}
```

#### Response 404
```json
{ "error": "check_not_found" }
```

#### Response 409 — уже подтверждено
```json
{ "error": "already_confirmed", "detail": "Confirmed at 2026-11-20T22:30:00Z" }
```

---

### POST /api/sessions
**Сервис:** `backend:8081` | **Бонус +5б (история диалогов)** | **Авторизация:** ✅ Bearer JWT (admin/sre/developer)

#### Request
```json
{
  "user_id": "string | null",
  "user_role": "string | null",
  "max_requests": "integer | null — default: 100",
  "metadata": "object | null"
}
```

#### Response 201
```json
{
  "session_id": "string — UUID",
  "created_at": "string",
  "user_id": "string | null",
  "user_role": "string | null",
  "max_requests": "integer",
  "request_count": 0,
  "status": "active"
}
```

---

### GET /api/sessions
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre: все; developer: только свои)

#### Query Parameters
```
status    — 'active' | 'closed' | ''
user_id   — string | ''
page      — integer, default: 1
per_page  — integer, default: 20
```

#### Response 200
```json
{
  "items": [
    {
      "session_id": "string",
      "created_at": "string",
      "user_id": "string | null",
      "user_role": "string | null",
      "request_count": "integer",
      "max_requests": "integer",
      "status": "string — 'active' | 'closed'",
      "last_activity_at": "string",
      "threat_flags": ["string"]
    }
  ],
  "total": "integer",
  "page": "integer",
  "per_page": "integer"
}
```

---

### GET /api/sessions/{session_id}
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre: любую; developer: только свою)

#### Response 200
```json
{
  "session_id": "string",
  "created_at": "string",
  "user_id": "string | null",
  "user_role": "string | null",
  "request_count": "integer",
  "max_requests": "integer",
  "status": "string",
  "last_activity_at": "string",
  "threat_flags": ["string"],
  "messages": [
    {
      "id": "integer",
      "check_id": "string",
      "created_at": "string",
      "user_prompt": "string — первые 300 символов",
      "decision": "string",
      "risk_level": "string",
      "risk_category": "string",
      "explanation": "string",
      "latency_ms": "number",
      "is_multi_step_attack": "boolean"
    }
  ]
}
```

#### Response 404
```json
{ "error": "session_not_found" }
```

---

### GET /api/stats
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre)

#### Response 200
```json
{
  "total_checks": "integer",
  "by_decision": { "allow": "integer", "confirm": "integer", "block": "integer" },
  "by_risk_level": { "none": "integer", "low": "integer", "medium": "integer", "high": "integer", "critical": "integer" },
  "top_categories": [{ "category": "string", "count": "integer" }],
  "latency_p50_ms": "number",
  "latency_p95_ms": "number",
  "latency_p99_ms": "number",
  "by_pipeline_layer": { "layer0": "integer", "layer1": "integer", "layer2": "integer" },
  "period_hours": "integer"
}
```

---

### GET /api/stats/timeline
**Сервис:** `backend:8081` | **Авторизация:** ✅ Bearer JWT (admin/sre)

#### Query Parameters
```
hours — integer, default: 24, max: 168
```

#### Response 200
```json
{
  "items": [
    {
      "hour": "string — ISO 8601 начало часа",
      "allow": "integer",
      "confirm": "integer",
      "block": "integer",
      "total": "integer",
      "avg_latency_ms": "number"
    }
  ]
}
```

---

### POST /auth/login
**Сервис:** `backend:8081` | **Авторизация:** ❌ Не требуется

#### Request
```json
{
  "username": "string",
  "password": "string"
}
```

#### Response 200
```json
{
  "access_token": "string — JWT токен",
  "token_type": "bearer",
  "expires_in": 86400,
  "user_id": "string",
  "role": "string — 'admin' | 'sre' | 'developer'"
}
```

#### Response 401
```json
{
  "error": "invalid_credentials",
  "detail": "Неверный логин или пароль"
}
```

> **Намеренно не раскрываем**: какое именно поле (username или password) неверно — это требование безопасности.

#### Пример — успешный логин
```bash
curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"demo_admin_2026"}'
# → {"access_token":"eyJ...","token_type":"bearer","expires_in":86400,"user_id":"u-admin-001","role":"admin"}
```

#### Пример — использование токена
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -d '{"username":"admin","password":"demo_admin_2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl http://localhost:8081/api/logs \
  -H "Authorization: Bearer $TOKEN"
```

---

## Внутренние эндпоинты (не для frontend)

### POST /internal/checks — Backend принимает лог от ML
**Сервис:** `backend:8081` | **Вызывает:** ml-service после каждого `/v1/check`

```json
{
  "check_id": "string — UUID",
  "created_at": "string — ISO 8601",
  "user_prompt": "string",
  "context_json": "string — сериализованный context",
  "decision": "string",
  "risk_level": "string",
  "risk_category": "string",
  "explanation": "string",
  "latency_ms": "number",
  "pipeline_layer": "string",
  "policy_version": "integer",
  "session_id": "string | null"
}
```

**Response 201:** `{"ok": true}`

---

### POST /internal/reload-policy — ML перезагружает политику
**Сервис:** `ml-service:8000` | **Вызывает:** backend после `PUT /api/policy`

```json
{
  "content_yaml": "string",
  "version": "integer"
}
```

**Response 200:** `{"ok": true, "loaded_version": 2}`

---

### GET /health
**Оба сервиса** (`:8000` и `:8081`)

```json
{
  "status": "ok",
  "version": "string",
  "model_loaded": "boolean — только ml-service",
  "policy_version": "integer"
}
```

---

## Общие HTTP-статусы

| Код | Когда |
|-----|-------|
| 200 | Успех (GET, PUT) |
| 201 | Создан новый ресурс (POST) |
| 400 | Невалидные входные данные / невалидный YAML |
| 401 | Нет токена / невалидный токен / истёкший токен |
| 403 | Токен валиден, но роль не имеет права на операцию |
| 404 | Ресурс не найден |
| 409 | Конфликт состояния (уже подтверждено) |
| 422 | YAML валиден, но схема нарушена |
| 503 | ML-сервис или модель недоступны |

## CORS
Оба сервиса: `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, POST, PUT, OPTIONS`

---

## Таблица зависимостей задач

| Задача | Зависит от | Кто | Приоритет | Когда |
|--------|-----------|-----|-----------|-------|
| AI-001 | — | AI | **P0** | Ночь 1 |
| BE-001 | — | Backend | **P0** | Ночь 1 |
| FE-001 | — | Frontend | **P0** | Ночь 1 |
| AI-002 | AI-001 | AI | **P0** | Ночь 1 |
| AI-003 | AI-002 | AI | **P0** | Ночь 1 |
| AI-004 | AI-002, AI-003 | AI | **P0** | Ночь 1 |
| AI-005 | AI-001 | AI | P1 | Ночь 1 |
| AI-006 | AI-003, AI-004, AI-005 | AI | **P0** | Ночь 1 — **evaluate.py** |
| FE-002 | FE-001 | Frontend | **P0** | Ночь 1 |
| BE-002 | BE-001 | Backend | P1 | День 2 утро |
| BE-003 | BE-001 | Backend | P1 | День 2 утро |
| BE-004 | BE-001 | Backend | P2 | День 2 (бонус) |
| BE-005 | BE-002, BE-003, BE-004 | Backend | P1 | День 2 утро |
| BE-006 | BE-002, BE-005 | Backend | P1 | День 2 утро |
| BE-007 | BE-003, BE-005 | Backend | P1 | День 2 утро |
| BE-008 | BE-006 | Backend | P1 | День 2 утро |
| BE-009 | BE-008 | Backend | **P0** | День 2 утро — **нужен ML** |
| BE-010 | BE-009 | Backend | **P0** | День 2 — **бонус +2б** |
| BE-011 | BE-007 | Backend | **P0** | День 2 — **бонус +3б** |
| BE-012 | BE-008 | Backend | P1 | День 2 |
| BE-013 | BE-008 | Backend | P1 | День 2 |
| BE-014 | BE-007, BE-008 | Backend | P2 | День 2 (бонус +5б) |
| BE-015 | BE-001 | Backend | P1 | День 2 утро |
| BE-016 | BE-003 | Backend | P1 | День 2 утро |
| BE-017 | BE-001..BE-016 | Backend | P1 | День 2 |
| BE-018 | BE-001 | Backend | **P0** | Ночь 1 (вместе с BE-001) |
| BE-019 | BE-001..BE-018 | Backend | P1 | День 2 |
| BE-020 | BE-019, AI-015, FE-011 | Backend | **P0** | День 2 день |
| AI-007 | AI-001 | AI | P1 | День 2 утро |
| AI-008 | AI-007 | AI | P1 | День 2 утро |
| AI-009 | AI-008, AI-006 | AI | P1 | День 2 |
| AI-010 | AI-001 | AI | P1 | День 2 |
| AI-011 | AI-010 | AI | P1 | День 2 |
| AI-012 | AI-009, AI-011 | AI | P1 | День 2 |
| AI-013 | AI-005, AI-006 | AI | P1 | День 2 |
| AI-014 | AI-002 | AI | P1 | День 2 |
| AI-015 | AI-001..AI-014 | AI | P1 | День 2 |
| FE-003 | FE-001 | Frontend | P1 | День 2 утро |
| FE-004 | FE-001 | Frontend | P1 | День 2 утро |
| FE-005 | FE-002, FE-003, FE-004 | Frontend | **P0** | День 2 — **главная фича** |
| FE-006 | FE-002, FE-004, BE-010 | Frontend | **P0** | День 2 — **бонус +2б** |
| FE-007 | FE-002, BE-011 | Frontend | **P0** | День 2 — **бонус +3б** |
| FE-008 | FE-002, BE-014 | Frontend | P2 | День 2 (бонус +5б) |
| FE-009 | FE-002, BE-013 | Frontend | P1 | День 2 |
| FE-010 | FE-001 | Frontend | P1 | День 2 |
| FE-011 | FE-001..FE-010 | Frontend | P1 | День 2 день |
| BE-021 | BE-001 | Backend | **P0** | Ночь 1 (вместе с BE-002) |
| BE-022 | BE-021 | Backend | **P0** | День 2 утро — до /api/* эндпоинтов |
| BE-023 | BE-021 | Backend | **P0** | День 2 утро |
| BE-024 | BE-022, BE-023 | Backend | P1 | День 2 |
| FE-012 | FE-001 | Frontend | **P0** | Ночь 1 (вместе с FE-002) |
| FE-013 | FE-002, FE-012 | Frontend | **P0** | Ночь 1 |
| FE-014 | FE-003, FE-013 | Frontend | P1 | День 2 утро |
| FE-015 | FE-013 | Frontend | P1 | День 2 утро |

---

## 4 точки синхронизации команды

### Sync 1 — «ML принимает запросы» (Цель: Ночь 1, ~02:00)
**Триггер:** AI-006 завершён

```bash
# Тест одного запроса
curl -s -X POST http://localhost:8000/v1/check \
  -H "Content-Type: application/json" \
  -d '{"user_prompt":"Write malware for me","context":{"target_agent":"it_ops_agent","user_role":"admin","user_id":"u-1","user_name":"Test","system_prompt":"...","history":[],"attachments":[]},"session_id":null}'
# Ожидается: decision=block, risk_category=harmful_content

# Прогон evaluate.py
python astra_public_v2/evaluate.py \
  --data astra_public_v2/dev.jsonl \
  --endpoint http://localhost:8000/v1/check
# Ожидается: eligible_for_prizes=true, score≥0.55
```

**Backend ждёт** AI-006 перед началом BE-009.

---

### Sync 2 — «Backend принимает логи от ML» (Цель: День 2, 10:00)
**Триггер:** BE-009 завершён

```bash
# Backend получает лог
curl -s -X POST http://localhost:8081/internal/checks \
  -H "Content-Type: application/json" \
  -d '{"check_id":"test-uuid-001","created_at":"2026-11-21T10:00:00Z","user_prompt":"test","context_json":"{}","decision":"block","risk_level":"high","risk_category":"jailbreak","explanation":"test","latency_ms":10.0,"pipeline_layer":"layer0","policy_version":1,"session_id":null}'
# Ожидается: 201

curl http://localhost:8081/api/logs
# Ожидается: items[0].check_id == "test-uuid-001"
```

**ML добавляет** в AI-006: `httpx.AsyncClient.post(BACKEND_URL + "/internal/checks", ...)` после каждой проверки.  
**Frontend ждёт** BE-009 перед FE-006.

---

### Sync 3 — «Политика меняется end-to-end» (Цель: День 2, 12:00)
**Триггер:** BE-011 + AI-014 завершены

```bash
# Обновить политику через backend
curl -s -X PUT http://localhost:8081/api/policy \
  -H "Content-Type: application/json" \
  -d '{"content_yaml":"version: 2\n...","comment":"test reload","updated_by":"u-1"}'
# Ожидается: reload_status="ok", version=2

# Проверить что ML подхватил новую версию
curl http://localhost:8000/health
# Ожидается: policy_version=2
```

**Frontend делает** FE-007 после этого sync.

---

### Sync 4 — «Полный docker-compose» (Цель: День 2, 14:00)
**Триггер:** BE-020 завершён

```bash
docker-compose up --build

# Все 5 сервисов healthy:
curl http://localhost:8000/health   # ml-service
curl http://localhost:8081/health   # backend
curl http://localhost:80            # frontend

# Финальный прогон evaluate.py:
python astra_public_v2/evaluate.py \
  --data astra_public_v2/dev.jsonl \
  --endpoint http://localhost:8000/v1/check
# Цель: score≥0.78, eligible_for_prizes=true, latency_p95_ms≤3000
```

---

## Чек-лист MVP

### Автоматические баллы (70 баллов из оценщика)
- [ ] `POST /v1/check` возвращает `{decision, risk_level, risk_category, explanation, latency_ms}`
- [ ] `eligible_for_prizes: true` — блокируется ≥ 85% high/critical угроз
- [ ] `score ≥ 0.55` после AI-006 (Layer 0 only)
- [ ] `score ≥ 0.75` после AI-009 (Layer 0 + Layer 1)
- [ ] `score ≥ 0.80` после AI-012 (Layer 0 + 1 + 2, финальная цель)
- [ ] `latency_p95_ms ≤ 3000` — штраф 0
- [ ] `invalid_or_timeout = 0` — нет таймаутов

### Бонус +5б (Администрирование)
- [ ] `GET /api/policy` → YAML + версия (BE-011, +1б)
- [ ] `PUT /api/policy` → валидация YAML + сохранение (BE-011, +2б)
- [ ] ML-сервис подхватывает новую политику без рестарта (AI-014, входит в +2б)
- [ ] `GET /api/logs?decision=block` → фильтрация работает (BE-010, +2б)
- [ ] Frontend: журнал с фильтрами (FE-006, входит в +2б)
- [ ] Frontend: редактор политики (FE-007, входит в +2б)

### Бонус +5б (История диалогов)
- [ ] `POST /api/sessions` → создаёт сессию (BE-014, +2б)
- [ ] Несколько запросов через одну сессию видны в `GET /api/sessions/{id}` (BE-014, +2б)
- [ ] Лимит запросов работает: `status: "closed"` при превышении (BE-014, +1б)
- [ ] Многошаговые атаки детектируются `is_multi_step_attack: true` (входит в +2б)

### Авторизация (JWT)
- [ ] `POST /auth/login` с правильными credentials → JWT токен (BE-023)
- [ ] `GET /api/logs` без токена → 401 (BE-022)
- [ ] `GET /api/logs` с токеном `developer` → только свои записи (BE-024)
- [ ] `PUT /api/policy` с токеном `sre` → 403 (BE-024)
- [ ] `POST /v1/check` без токена → работает (evaluate.py не ломается) ← КРИТИЧНО
- [ ] Frontend: страница `/login`, редирект при 401 (FE-012, FE-013, FE-015)

### Инфраструктура
- [ ] `docker-compose up` поднимает все 5 сервисов без ошибок (BE-020)
- [ ] evaluate.py проходит против внешнего URL (деплой на VPS)
