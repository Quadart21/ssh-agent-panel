from app.core.config import settings
from app.models import User
from app.services.notification_settings import get_or_create_notification_settings
from app.services.telegram import format_telegram_message, resolve_telegram_topic_id, send_telegram_message, telegram_is_configured


def summarize_panel_user_access(
    *,
    role: str,
    section_permissions: list[str],
    action_permissions: list[str],
    allowed_server_ids: list[int],
) -> str:
    if role == "admin":
        return "Администратор · все разделы и серверы"

    servers = "все серверы" if not allowed_server_ids else f"{len(allowed_server_ids)} сервер(ов)"
    if not section_permissions and not action_permissions:
        return f"Без явных прав · {servers}"

    return f"{len(section_permissions)} раздел(ов), {len(action_permissions)} действий · {servers}"


def notify_panel_user_created(
    db,
    *,
    user: User,
    password: str,
    created_by: User,
    access_summary: str,
    notify_telegram: bool,
) -> tuple[bool, str | None]:
    if not notify_telegram:
        return False, "Отправка в Telegram отключена при создании."
    if not telegram_is_configured(db):
        return False, "Telegram не настроен в панели."

    profile = get_or_create_notification_settings(db)
    panel_url = settings.frontend_origin.rstrip("/")
    role_label = "Администратор" if user.role == "admin" else "Пользователь"

    message = format_telegram_message(
        "Создан пользователь панели",
        icon="👤",
        facts=[
            ("Имя", user.full_name),
            ("Email", user.email),
            ("Пароль", password),
            ("Роль", role_label),
            ("Доступ", access_summary),
            ("Панель", panel_url),
            ("Создал", created_by.email),
        ],
        lines=[
            "При первом входе потребуется сменить пароль.",
            "Передайте данные пользователю по защищённому каналу.",
        ],
    )
    reply_markup = {
        "inline_keyboard": [[{"text": "🔐 Открыть панель", "url": panel_url}]],
    }

    try:
        send_telegram_message(
            message,
            db,
            parse_mode="HTML",
            topic_id=resolve_telegram_topic_id(profile, "panel_user_created"),
            reply_markup=reply_markup,
        )
    except Exception as exc:
        return False, str(exc)

    return True, None
