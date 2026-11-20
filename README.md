## Запуск проекта

### 1. Скопировать шаблон `.env`:

```bash
cp .env.example .env

### 2. Заполнить .env своими паролями

MYSQL_ROOT_PASSWORD=ваш_пароль
DB_PASSWORD=ваш_пароль

### 3. Запустить

docker-compose up -d --build
```