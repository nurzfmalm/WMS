# WMS — склад автомобилей

Система управления автомобильным складом на FastAPI.

## API

```bash
cd api
pip install -r requirements.txt
uvicorn api:app --reload
```

API доступен на `http://127.0.0.1:8000`, документация — на `http://127.0.0.1:8000/docs`.

## Frontend

Из корня проекта:

```bash
py -m http.server 5500 --directory frontend
```

Интерфейс доступен на `http://127.0.0.1:5500`.

## Тесты и линтер

```bash
cd api
pip install -r requirements.txt
python -m pytest
python -m ruff check .
python -m ruff format --check .
```

Тесты находятся в `api/tests`.
