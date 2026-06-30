# ALGO Demo — симуляция платформы

Полнофункциональное демо без docker: диагностика (CAT), экзамены (wizard → draft → publish → student), admin-отчёты. Данные захардкожены для классов 5–8.

## Быстрый старт

```bash
cd algo-front
npm install
npm run dev:demo
```

Откройте http://localhost:3000/login

| Роль | Вход |
|------|------|
| Admin | `demo@algo.ru` / `demo2026` или кнопка Dev Admin |
| Teacher | `teacher@algo.ru` / `demo2026` или кнопка Dev Teacher |

## Сценарий показа (5 мин)

1. **Admin** → `/admin/diagnostics` → открыть отчёт **DIAG03** (Мария Иванова)
2. **Admin** → «Новая диагностика» → создать ученика → QR-код
3. **Student** → `/d/DIAG01` или `/d/DIAG02` → пройти CAT (15–17 вопросов)
4. **Admin** → обновить список → «Отчёт» по завершённой диагностике
5. **Teacher** → `/teacher/exams/new` → 8 класс → по темам или учебнику → сгенерировать
6. **Teacher** → draft → опубликовать → код экзамена
7. **Student** → `/e/<код>` → пройти экзамен → разбор ответов
8. **Teacher** → сессии опубликованного экзамена → аналитика класса

## Pre-seeded коды

| Код | Тип | Статус |
|-----|-----|--------|
| `DIAG01` | Диагностика | pending (нужен confirm имени) |
| `DIAG02` | Диагностика | confirmed (сразу старт) |
| `DIAG03` | Диагностика | completed (готовый отчёт) |

## Архитектура

- Вся mock-логика в `demo/` (изолировано от prod)
- Next.js API route: `/api/demo/v1/[...path]`
- `NEXT_PUBLIC_DEMO_MODE=true` переключает все API на demo

## Деплой на Vercel

**Production:** https://algo-front-ten.vercel.app

1. Синхронизировать `demo/` в `algo-front/demo` (Vercel не видит папку вне проекта):
   ```bash
   cd algo-front && npm run sync-demo
   ```
2. Деплой: `npm run deploy:demo` или `npx vercel deploy --prod`
3. Env в `vercel.json`: `NEXT_PUBLIC_DEMO_MODE=true`, build: `npm run build:demo`

## Обновление fixtures

```bash
python3 demo/scripts/build-fixtures.py
```

Генерирует 18 задач на класс (5–8), skill trees, учебники, TOC, invites, exams.

## Структура demo/

```
demo/
├── fixtures/     # JSON данные
├── engine/       # CAT, exam generator, grader
├── handlers/     # API mock handlers
└── scripts/      # build-fixtures.py
```
