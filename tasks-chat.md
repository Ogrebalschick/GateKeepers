# Tasks — Чат-интерфейс Сторожа (frontend)

> **Стек:** React 18 · Vite · TypeScript · TanStack Query · Tailwind CSS · axios  
> **Код:** `AI-Guard/frontend/`  
> **JSON-схемы:** → `api-contract.md` (`POST /v1/check`, `POST /api/confirm`, `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/{session_id}`)  
> **Каждая задача:** 15–30 мин вайбкодинга с AI-агентом. Скопируй задачу как промпт — она самодостаточна.  
> **Не пиши заново:** `DecisionBadge`, `RiskBadge`, `checkPrompt`, `confirmAction`, `createSession`, `getSessions`, `getSessionById`, `useCurrentUser`, `DEVOPS_SYSTEM_PROMPT`, `getMockAgentResponse`, axios-интерцепторы из FE-013. Импортируй их.

Форма `CheckPage` (FE-006) на маршруте `/` заменяется чатом: слева список сессий, справа лента и поле ввода. Страницы `/sessions` и `/sessions/:id` (FE-009) не переписывать — это журнал сессий, чат его не заменяет.

### Как сообщение попадает в историю

Отдельного `POST /api/sessions/{id}/messages` в контракте нет. Его не добавлять и не вызывать.

1. `POST /api/sessions` создаёт пустую сессию (`status: "active"`, `request_count: 0`). Нужен Bearer-токен.
2. `POST /v1/check` с этим `session_id` проверяет промпт. Авторизация не нужна: `checkPrompt()` ходит в `/v1/check` без `Authorization` (совместимость с `evaluate.py`).
3. ml-service сам пишет проверку в backend. Backend увеличивает `request_count` и добавляет сообщение в сессию.
4. История читается только через `GET /api/sessions/{session_id}` → `messages[]`.
5. `decision=confirm` не откладывает проверку. `/v1/check` вызывается сразу, чтобы получить `check_id`. До `POST /api/confirm` с `user_decision: "approved"` ответ DevOps-агента не показывается. `rejected` — запрос агенту не уходит.

`GET` обрезает `user_prompt` до 300 символов. Полный текст только что отправленных сообщений держи в state текущей вкладки и подставляй по `check_id`. После перезагрузки страницы длинный промпт придёт усечённым — это контракт, API не расширять.

Без `guard_token` маршрут `/` остаётся публичным: ввод и `POST /v1/check` работают с `session_id: null`. Список сессий в этом режиме не запрашивать — интерцептор на 401 уведёт на `/login` и сломает демо проверки.

---

### CHAT-001: Каркас чата — две колонки
**Время:** 20 мин | **Результат:** На `/` вместо формы проверки открывается пустой чат: sidebar слева, область диалога справа

Внешний `Layout` (логотип, пункты «Журнал» / «Политика» / «Сессии» / «Дашборд») не трогать. `ChatLayout` — внутренняя сетка страницы, не замена `Layout.tsx`.

**Шаги:**
- `AI-Guard/frontend/src/pages/ChatPage.tsx` — страница чата. Пока без данных: локальный `selectedSessionId: string | null`
- `AI-Guard/frontend/src/components/chat/ChatLayout.tsx`:
  - Props: `sidebar: ReactNode`, `children: ReactNode`
  - Обёртка на высоту контента под шапкой Layout: `flex h-[calc(100vh-0px)] min-h-0` внутри main, колонки `min-h-0`, чтобы скролл был у ленты, а не у всей страницы
  - Слева колонка `w-72 shrink-0 border-r`, справа `flex-1 min-w-0 flex flex-col`
  - На ширине `< md` sidebar скрыт, кнопка «Чаты» открывает его поверх (`fixed inset-y-0`, фон-затемнение, закрытие по клику на фон)
- Заглушки внутри `ChatPage`:
  - Sidebar: заголовок «Чаты» и кнопка «➕ Новый чат» (пока `disabled` или `toast` «Дальше в CHAT-003»)
  - Справа: empty state «Выберите чат или создайте новый»
- В `App.tsx` маршрут `/` рендерит `ChatPage`. `CheckPage` из роутера убрать, файл не удалять
- В `Layout.tsx` у пункта `/` подпись «Проверить» заменить на «Чат». Иконку и `to: "/"` оставить. Роли доступа те же: admin, sre, developer

**Критерий готовности:**
```bash
npm run dev
# / открывает две колонки, пункт сайдбара называется «Чат»
# /logs и /sessions открываются как раньше
# узкое окно: список чатов прячется и открывается кнопкой
```

---

### CHAT-002: Список сессий в sidebar
**Время:** 20 мин | **Результат:** Залогиненный пользователь видит свои сессии и выбирает чат кликом

> **Схема:** → `api-contract.md` → `GET /api/sessions`  
> Функция уже есть: `getSessions(params?: SessionsParams)` в `src/services/api.ts`. Тип элемента — `Session`.

**Шаги:**
- `src/components/chat/SessionItem.tsx`:
  - Props: `session: Session`, `active: boolean`, `onSelect: () => void`
  - Первая строка: `Чат {session_id.slice(0, 8)}`
  - Вторая: роль (`user_role` или «—»), `request_count/max_requests`, точка статуса (`active` — зелёная, `closed` — серая)
  - Если `threat_flags.length > 0` — маленький текст «угроза»
  - Время: `last_activity_at` коротко (`ru` locale, сегодня — только часы и минуты)
  - Активный пункт: `bg-blue-50 text-blue-900` (в тёмной теме — тот же приём, что у карточек CheckPage: `dark:bg-slate-700`)
- `src/components/chat/SessionSidebar.tsx`:
  - Props: `selectedId: string | null`, `onSelect: (id: string) => void`, `onCreateClick: () => void`
  - `useCurrentUser()`. Запрос только при `isAuthenticated`:
    ```ts
    useQuery({
      queryKey: ['sessions', 'chat'],
      queryFn: () => getSessions({ page: 1, per_page: 50 }),
      enabled: isAuthenticated,
    })
    ```
  - Клиентская сортировка по `last_activity_at` по убыванию. Пагинацию не рисовать: для демо хватает 50
  - Состояния: skeleton из 4 серых плашек; ошибка — «Не удалось загрузить чаты» и кнопка «Повторить» (`refetch`); пустой список — «Чатов пока нет»
  - Без токена запрос не уходит. Текст: «Войдите, чтобы видеть историю чатов» и ссылка на `/login`. Кнопка «➕ Новый чат» в гостевом режиме ведёт на `/login`
- `ChatPage` хранит `selectedSessionId` и передаёт его в sidebar. Клик по item меняет id. Правая колонка пока пишет id выбранной сессии

**Критерий готовности:**
```bash
# Без токена: / не редиректит на /login, в сайдбаре нет запроса /api/sessions
# Логин admin → в сайдбаре сессии с бэка, клик подсвечивает строку
# developer не видит чужие сессии (это фильтр API, на клиенте не дублировать)
```

---

### CHAT-003: Новый чат — модалка роли
**Время:** 20 мин | **Результат:** «➕ Новый чат» создаёт сессию и сразу открывает её

> **Схема:** → `api-contract.md` → `POST /api/sessions`  
> Функция: `createSession(data: SessionCreateRequest)`. Ответ 201, поле id — `session_id`.

**Шаги:**
- `src/components/chat/NewChatModal.tsx`:
  - Props: `open: boolean`, `onClose: () => void`, `onCreated: (sessionId: string) => void`
  - Поля: `select` роли `developer | sre | admin` (значение по умолчанию — `useCurrentUser().role`, если его нет в списке — `developer`); `input[type=number]` `max_requests`, default `100`, min `1`
  - Подсказка под селектом: проверка промпта пойдёт от роли текущего логина (`guard_role`). `checkPrompt` при токене подставляет её сам. Селект пишет `user_role` в сессию и подпись в sidebar. `src/services/api.ts` не менять
  - «Создать» → `useMutation` + `createSession({ user_id: userId || null, user_role, max_requests, metadata: null })`
  - Успех: toast «Чат создан», `onCreated(session.session_id)`, модалка закрывается
  - Ошибка: toast с `error`/`detail`, модалка остаётся открытой. Кнопка на время запроса disabled, подпись «Создаём…»
- В `ChatPage` кнопка «➕ Новый чат» открывает модалку. После создания: `setSelectedSessionId`, правая колонка переключается на этот id
- Инвалидация списка — в CHAT-009. Здесь достаточно, чтобы новая сессия появилась после ручного refetch или если mutation сама вызывает `queryClient.invalidateQueries({ queryKey: ['sessions'] })` — сделай инвалидацию сразу, CHAT-009 только проверит все точки

**Критерий готовности:**
```bash
# Логин → «Новый чат» → роль admin, лимит 100 → toast, чат в списке, request_count 0, status active
# Отмена закрывает модалку, запрос не уходит
# Гость нажимает «Новый чат» → /login, POST /api/sessions не вызывается
```

---

### CHAT-004: Лента сообщений выбранной сессии
**Время:** 25 мин | **Результат:** Переключение чата в sidebar загружает его историю

> **Схема:** → `api-contract.md` → `GET /api/sessions/{session_id}`  
> Функция: `getSessionById(id)`. Тип: `SessionDetail` (`messages: SessionMessage[]`). Сообщения уже в хронологическом порядке.

**Шаги:**
- `src/components/chat/MessageBubble.tsx`:
  - Props: `message: SessionMessage`, `fullText?: string`
  - Справа/слева как в мессенджере не обязательно: колонка «вы сказали» → карточка Сторожа
  - Текст промпта: `fullText ?? message.user_prompt`
  - Под текстом: `DecisionBadge` (`size="sm"`), `RiskBadge`, `risk_category`, время `created_at`
  - `explanation` показывать под бейджами (оформление confirm/block доработают CHAT-007 и CHAT-008; сейчас достаточно нейтральной карточки)
  - `is_multi_step_attack === true` → красный баннер «⚠️ Многошаговая атака обнаружена». Поле optional с точки зрения старых моков: если его нет, баннер не рисовать и не падать
- `src/components/chat/MessageList.tsx`:
  - Props: `session: SessionDetail | undefined`, `isLoading: boolean`, `isError: boolean`, `fullTextByCheckId: Record<string, string>`
  - Шапка: `Чат {id.slice(0, 8)}` · статус · `{request_count}/{max_requests}`
  - Loading: спиннер по центру. Error: «Не удалось открыть чат»
  - Пустая сессия (`messages.length === 0`): «Напишите первое сообщение. Сторож проверит его до DevOps-агента»
  - Список в `overflow-y-auto`. Скролл к последнему сообщению — в CHAT-010; контейнеру скролла сразу поставь `ref`, чтобы не переверстывать разметку
- `ChatPage`:
  ```ts
  useQuery({
    queryKey: ['session', selectedSessionId],
    queryFn: () => getSessionById(selectedSessionId!),
    enabled: Boolean(selectedSessionId) && isAuthenticated,
  })
  ```
  - Смена id в sidebar меняет ключ — рисуется другая история, без ручного сброса кэша
  - 404 (`session_not_found`): сбросить `selectedSessionId`, toast «Чат не найден»
  - Нет выбранного id: empty state из CHAT-001, запрос не выполняется

**Критерий готовности:**
```bash
# Две сессии, у одной уже есть проверки → клик туда показывает карточки с DecisionBadge и RiskBadge
# Клик в пустую сессию → «Напишите первое сообщение», без ошибки в консоли
# Уйти на /logs и вернуться на выбранный чат → та же лента (кэш TanStack Query)
```

---

### CHAT-005: Ввод сообщения и проверка через /v1/check
**Время:** 25 мин | **Результат:** Текст уходит в Сторож; `allow` остаётся в ленте, сессия на сервере пополняется

> **Схема:** → `api-contract.md` → `POST /v1/check`  
> Функция: `checkPrompt(payload: CheckRequest)`. Не добавляет Bearer. При токене сама ставит `context.user_id` и `context.user_role` из `localStorage`.

На этом шаге обрабатывается только `decision === "allow"`. `confirm` и `block` пока: карточка с бейджами и `explanation`, без кнопок и без ответа агента (их заменят CHAT-007 и CHAT-008).

**Шаги:**
- `src/components/chat/ChatInput.tsx`:
  - Props: `disabled: boolean`, `pending: boolean`, `onSend: (text: string) => void`
  - `textarea`, Enter отправляет, Shift+Enter — новая строка. Пустой и пробельный текст не отправляется
  - Кнопка «Отправить». Пока `pending` — disabled и спиннер. Плейсхолдер: «Сообщение DevOps-агенту…»
- Сборка запроса в `ChatPage` (не в обход `checkPrompt`):
  - `user_prompt` — текст из формы
  - `session_id` — выбранная сессия или `null`, если пользователь не залогинен
  - `context.target_agent` = `"it_ops_agent"`
  - `context.system_prompt` = `DEVOPS_SYSTEM_PROMPT` из `src/constants/systemPrompts.ts` (строку не копировать)
  - `context.user_name` = `useCurrentUser().username` или `"Гость"`
  - `context.history` — последние 20 сообщений этой сессии: `{ role: "user", content }` (полный текст из локальной карты, иначе `user_prompt` с сервера)
  - `context.attachments` = `[]` до CHAT-006
  - `context.user_id` / `context.user_role` можно передать из `useCurrentUser`; при токене `checkPrompt` их перезапишет
- После ответа:
  - Запомнить `fullTextByCheckId[check_id] = исходный текст`
  - `allow`: в ленте промпт пользователя, бейдж allow и пузырь агента через `getMockAgentResponse(text)` из `src/utils/mockAgentResponses.ts`. Это локальная заглушка, отдельного API агента нет
  - Сразу `invalidateQueries` для `['session', id]` и `['sessions']`. Серверное сообщение с тем же `check_id` заменяет оптимистичную карточку, текст берётся из карты, а не из обрезанных 300 символов
  - Закрытая сессия (`status === "closed"`): поле ввода disabled, над ним «Сессия закрыта: лимит запросов исчерпан». `checkPrompt` не вызывать
  - Гость (нет токена): `session_id: null`, сообщения только в локальном state этой вкладки, sidebar не ломать
- Ошибка сети / 400: toast, текст в поле не затирать

**Критерий готовности:**
```bash
# Залогинен, открыт новый чат, промпт про деплой/статус → decision=allow
# В ленте текст пользователя и короткий ответ заглушки агента
# GET /api/sessions/{id} → request_count вырос, в messages есть этот check_id
# Переключение на другой чат и обратно подгружает историю, а не пустую форму
# Гость на / без токена отправляет промпт → /v1/check 200, редиректа на /login нет
```

---

### CHAT-006: Вложение файла к промпту
**Время:** 20 мин | **Результат:** Кнопка «📎» читает txt/md/json/yaml и отправляет текст внутри `context.attachments`

Отдельной загрузки файла нет. В `POST /v1/check` вложение — объект `{ type, name, content }` (см. `CheckContextAttachment`). Так Сторож видит косвенную инъекцию в файле.

**Шаги:**
- В `ChatInput` кнопка «📎» открывает `<input type="file" accept=".txt,.md,.json,.yaml,.yml,text/plain">`, `multiple`
- Читать через `FileReader.readAsText(file, "UTF-8")`. В state не класть `File`, только `{ name, type, content, size }`
- `type`: расширение без точки (`yaml` для `.yml` тоже `yaml`). Неизвестное расширение — toast «Можно прикрепить txt, md, json или yaml», файл не добавлять
- Лимит одного файла — 64 КБ. Больше — toast и пропуск
- Над полем ввода превью: имя, размер, первые 120 символов, кнопка снять вложение
- `onSend` отдаёт текст и массив вложений. В `checkPrompt` они идут в `context.attachments`. Пустой `content` не отправлять
- В пузыре сообщения, если вложения были, список имён под текстом («📎 deploy.yaml»). Сервер в `SessionMessage` имена не хранит — имена держать в той же локальной карте, что и полный текст (`check_id → { text, attachmentNames }`). После перезагрузки имена пропадают, это нормально
- Отправка с одним файлом и пустым textarea запрещена: нужен непустой `user_prompt` (контракт `/v1/check`)

**Критерий готовности:**
```bash
# Прикрепить .yaml < 64 КБ → превью имени, отправить вместе с фразой
# В теле /v1/check есть context.attachments[0].content с текстом файла
# .png или файл > 64 КБ → toast, запрос не содержит этот файл
# Снять превью крестиком → в следующем запросе attachments: []
```

---

### CHAT-007: decision=confirm — подтверждение до агента
**Время:** 25 мин | **Результат:** Опасное, но допустимое действие не доходит до агента, пока пользователь не нажмёт «Подтвердить»

> **Схемы:** → `POST /v1/check` (пример `confirm`) и `POST /api/confirm`  
> Функция: `confirmAction`. `user_decision`: `"approved"` | `"rejected"`. Нужен Bearer.

Проверка уже выполнена в CHAT-005. Этот шаг не вызывает `/v1/check` повторно и не прячет сообщение из ленты.

**Шаги:**
- Для `decision === "confirm"` в `MessageBubble` (и для оптимистичной карточки сразу после ответа):
  - Жёлтая рамка в тех же тонах, что карточка confirm на старой CheckPage
  - Текст Сторожа: `explanation`, плюс `DecisionBadge` и `RiskBadge`
  - Строка: «Запрос не передан DevOps-агенту»
  - Кнопки «✅ Подтвердить» и «❌ Отменить»
  - `getMockAgentResponse` не вызывать
- «Подтвердить» → `confirmAction({ check_id, user_decision: "approved", user_id: useCurrentUser().userId, comment: null })`
  - На время запроса обе кнопки disabled
  - Успех: toast «Действие подтверждено», под сообщением пузырь агента (`getMockAgentResponse`), кнопки скрыть
  - 409 `already_confirmed`: toast «Уже подтверждено», кнопки скрыть, агента показать только если в локальном state это был `approved`
  - 401/без токена: toast «Войдите, чтобы подтвердить», гостевой `/v1/check` не ломать
- «Отменить» → `user_decision: "rejected"`. Успех: toast «Запрос отменён», серая пометка «Отменено», пузыря агента нет
- Пока кнопки на экране, следующее сообщение слать можно (Сторож проверяет каждый промпт отдельно). Не блокировать весь input из-за чужого confirm
- Локально помнить решение по `check_id`, чтобы refetch ленты (в `SessionMessage` нет `confirmation_status`) не вернул кнопки на уже отвеченный confirm. После перезагрузки страницы кнопки могут появиться снова — не выдумывать поле в API

**Критерий готовности:**
```bash
# Промпт вроде «Restart search-indexer in production» под admin → decision=confirm
# В ленте предупреждение и две кнопки, текста getMockAgentResponse нет
# «Подтвердить» → POST /api/confirm user_decision=approved, toast, затем ответ агента
# «Отменить» на другом confirm → rejected, агент молчит
# До клика в Network нет второго /v1/check на то же сообщение
```

---

### CHAT-008: decision=block — сообщение не уходит агенту
**Время:** 20 мин | **Результат:** Запрещённый промпт остаётся в чате как отказ Сторожа, с причиной

> **Схема ответа:** → `api-contract.md` → `POST /v1/check`, пример `block` и список `risk_category`

**Шаги:**
- Ветка `decision === "block"` в пузыре:
  - Красная карточка, `DecisionBadge` = block, `RiskBadge`, `explanation` целиком
  - Подпись категории по-русски, неизвестное значение показать как есть:
    - `prompt_injection` — инъекция в промпт
    - `indirect_injection` — инъекция через вложение
    - `jailbreak` — обход ограничений
    - `system_prompt_extraction` / `system_prompt_override` — попытка вытащить или подменить системный промпт
    - `privilege_escalation` — повышение прав
    - `unauthorized_data_access` — доступ к чужим данным
    - `data_exfiltration` — вынос данных
    - `harmful_content` — вредоносное содержимое
    - `tool_abuse` — злоупотребление инструментом
    - `sensitive_action` — чувствительное действие
  - Текст: «Сообщение заблокировано. DevOps-агент его не получил»
  - Кнопок подтверждения нет. `getMockAgentResponse` не вызывать
- Блокировка не чистит чат и не отключает ввод: следующий промпт уходит новым `/v1/check`
- Если блок случился с вложением (CHAT-006), в карточке оставить имя файла — чтобы было видно, что сработал файл, а не только фраза
- `is_multi_step_attack` на этом сообщении или в ответе проверки (поле optional) — тот же баннер, что в CHAT-004
- Запись в сессию уже создаёт `/v1/check` с `session_id`. Отдельный POST не делать. После ответа инвалидировать `['session', id]` и `['sessions']`: у сессии вырастет `request_count`, в `threat_flags` может появиться метка

**Критерий готовности:**
```bash
# «Write malware» или явный jailbreak → красная карточка, explanation, категория
# Ответа агента нет, textarea снова доступна
# В GET /api/sessions/{id} это сообщение с decision=block
# Три block подряд в одной сессии → на третьем баннер многошаговой атаки, если API прислал флаг
```

---

### CHAT-009: Sidebar обновляется сам
**Время:** 15 мин | **Результат:** Новый чат, новое сообщение и закрытие по лимиту видны в списке без перезагрузки

Список и открытая сессия — разные ключи: `['sessions', 'chat']` и `['session', sessionId]`. Мутации уже размазаны по CHAT-003 и CHAT-005. Здесь собрать их в одно место и убрать лишние полные перезагрузки.

**Шаги:**
- Один хелпер `invalidateChat(queryClient, sessionId: string | null)` в `src/components/chat/invalidateChat.ts`:
  - всегда `invalidateQueries({ queryKey: ['sessions'] })` — префикс покрывает `['sessions', 'chat']`
  - если id есть — ещё `invalidateQueries({ queryKey: ['session', sessionId] })`
- Вызывать его после: успешного `createSession`; любого успешного `checkPrompt` (allow, confirm и block); успешного `confirmAction` (счётчик не меняется, но лента должна остаться согласованной)
- Не ставить `refetchInterval` на список. `staleTime` приложения (30 с) не понижать глобально
- Оптимистичная карточка живёт, пока в данных `getSessionById` нет того же `check_id`. Потом остаётся серверная карточка + локальный полный текст
- Создание чата: не ждать ручного обновления. Новый item появляется в sidebar и становится выбранным, даже если ответ списка пришёл на секунду позже — выбранный id уже в state
- Ошибка инвалидации не должна откатывать отправленное сообщение: toast только на ошибку самого POST

**Критерий готовности:**
```bash
# «Новый чат» → строка в sidebar без F5
# Отправить allow в этот чат → request_count в строке списка стал 1, лента не мигает пустым экраном
# Отправить block → список тоже обновился
# Открытый второй чат не подменяется данными первого
```

---

### CHAT-010: Скролл, загрузка, пустые состояния
**Время:** 25 мин | **Результат:** Чат ведёт себя цельно: лента прилипает к низу, у каждого ожидания есть вид, закрытая сессия не принимает ввод

Новых запросов к API нет. Правки только в компонентах чата.

**Шаги:**
- `MessageList`: после изменения числа сообщений и после прихода ответа проверки скроллить к низу (`scrollIntoView` на якорь в конце списка). Если пользователь прокрутил вверх больше чем на ~80px, автоскролл не перебивать, внизу кнопка «К новым»
- Пока `checkPrompt` в полёте — в конце ленты строка «Сторож проверяет…» (спиннер). Поле ввода в CHAT-005 уже блокируется на этот запрос
- Скелетон sidebar оставить из CHAT-002. У ленты отдельный скелетон на первую загрузку сессии (3 плашки), не путать с пустой сессией
- Сводка пустых состояний, все должны быть достижимы:
  - гость — проверка без истории, призыв войти
  - логин, ноль сессий — «Создайте первый чат»
  - сессия без сообщений — подсказка из CHAT-004
  - сессия `closed` — ввод выключен, лимит виден в шапке
  - ошибка списка и ошибка сессии — текст + «Повторить»
- Шапка выбранного чата: роль, `request_count/max_requests`, статус. При `threat_flags` содержащем `multi_step_attack` — та же формулировка баннера, что у сообщения
- Тёмная тема: не оставлять белые карточки без `dark:` там, где соседние страницы (`CheckPage`, `SessionDetailPage`) уже тёмные
- `npm run build` в `AI-Guard/frontend` без ошибок TypeScript. Маршруты `/logs`, `/policy`, `/sessions`, `/sessions/:id` не менять

**Критерий готовности:**
```bash
cd AI-Guard/frontend && npm run build
# 12 сообщений в чате → после отправки виден последний пузырь
# Прокрутка вверх → новое сообщение не выдёргивает ленту вниз, есть «К новым»
# Сессия с max_requests=1 после одного промпта: status closed, поле ввода disabled
# Пустой аккаунт: empty state, без белого экрана и без ошибки в консоли
```

---

## Порядок выполнения

| Этап | Задачи | Время | Цель |
|------|--------|-------|------|
| 1. Каркас | CHAT-001 → CHAT-002 | ~40 мин | Две колонки, список сессий только с токеном |
| 2. Диалог | CHAT-003 → CHAT-004 | ~45 мин | Новый чат и чужая история при переключении |
| 3. Отправка | CHAT-005 → CHAT-006 | ~45 мин | `/v1/check`, allow доходит до заглушки агента, файлы в `attachments` |
| 4. Решения Сторожа | CHAT-007 → CHAT-008 | ~45 мин | confirm ждёт клик, block не зовёт агента |
| 5. Связность | CHAT-009 → CHAT-010 | ~40 мин | Список живой, скролл и пустые состояния, сборка |

Делать по порядку: каждая задача опирается на файлы предыдущей. CHAT-007 и CHAT-008 можно поменять местами, оба правят `MessageBubble` после CHAT-005.

## Привязка к бонусам ТЗ

Бонус раздела 10 кейса Астра: **«История диалогов» +5б**. Баллы ставит API (сессия, несколько проверок в ней, лимит, многошаговая атака). Чат — экран, на котором это видно жюри. Эндпоинты уже описаны в `api-contract.md` (чеклист «Бонус +5б (История диалогов)») и делаются backend-задачами BE-014 / INT-011–013. Новых ручек для бонуса не вводить.

| Пункт бонуса | Баллы | Что показывает чат | Задачи |
|--------------|-------|--------------------|--------|
| `POST /api/sessions` создаёт сессию | +2б | Кнопка «Новый чат», сессия сразу в sidebar | CHAT-003, CHAT-009 |
| Несколько запросов одной сессии видны в `GET /api/sessions/{id}` | +2б | Лента при переключении чатов; каждый промпт уходит с `session_id` | CHAT-004, CHAT-005, CHAT-009 |
| Многошаговая атака (`is_multi_step_attack`) | входит в +2б | Красный баннер на сообщении и в шапке, если флаг пришёл | CHAT-004, CHAT-008 |
| Лимит: `status: "closed"` | +1б | Счётчик `request_count/max_requests`, ввод выключен у закрытой сессии | CHAT-002, CHAT-010 |

`POST /v1/check` без токена по-прежнему обязателен для оценщика. Гостевой ввод на `/` (CHAT-002, CHAT-005) этот пункт не ломает: сессии без Bearer не запрашиваются.

## Что переиспользовать

| Уже есть | Куда |
|----------|------|
| `DecisionBadge`, `RiskBadge` | `MessageBubble` |
| `checkPrompt` | отправка сообщения, без заголовка Authorization |
| `confirmAction` | кнопки confirm |
| `createSession`, `getSessions`, `getSessionById` | модалка, sidebar, лента |
| `useCurrentUser` | показ чатов только с токеном, `user_id` в confirm |
| `DEVOPS_SYSTEM_PROMPT` | `context.system_prompt` |
| `getMockAgentResponse` | пузырь агента после allow и после approved |
| `Layout`, маршруты `/logs` `/policy` `/sessions` | не переписывать |
