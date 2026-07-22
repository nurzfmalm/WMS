import secrets
from threading import RLock


class AuthStorage:
    def __init__(self):
        self._users: dict[str, str] = {}
        self._sessions: dict[str, str] = {}
        self._lock = RLock()

    def register(self, username: str, password: str) -> str:
        normalized = username.strip().lower()
        if len(normalized) < 3:
            raise ValueError("Логин должен содержать минимум 3 символа")
        with self._lock:
            if normalized in self._users:
                raise ValueError("Пользователь с таким логином уже существует")
            self._users[normalized] = password
            return self._create_session(normalized)

    def login(self, username: str, password: str) -> str:
        normalized = username.strip().lower()
        with self._lock:
            if self._users.get(normalized) != password:
                raise ValueError("Неверный логин или пароль")
            return self._create_session(normalized)

    def _create_session(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = username
        return token

    def get_username(self, token: str | None) -> str | None:
        with self._lock:
            return self._sessions.get(token or "")

    def logout(self, token: str | None) -> None:
        with self._lock:
            self._sessions.pop(token or "", None)
