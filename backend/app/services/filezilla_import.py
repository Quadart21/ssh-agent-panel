from __future__ import annotations

import base64
import xml.etree.ElementTree as ET
from dataclasses import dataclass


@dataclass(frozen=True)
class FileZillaImportedServer:
    name: str
    ip: str
    port: int
    login: str
    password: str | None
    group_name: str | None


def _decode_password(node: ET.Element | None) -> str | None:
    if node is None or not node.text:
        return None
    encoding = node.attrib.get("encoding", "").lower()
    raw = node.text.strip()
    if not raw:
        return None
    if encoding == "base64":
        try:
            return base64.b64decode(raw).decode("utf-8")
        except Exception as exc:
            raise ValueError("Не удалось расшифровать пароль FileZilla (base64).") from exc
    return raw


def _parse_server_node(node: ET.Element, group_name: str | None) -> FileZillaImportedServer:
    host = (node.findtext("Host") or "").strip()
    if not host:
        raise ValueError("В XML FileZilla найден сервер без Host.")

    name = (node.findtext("Name") or host).strip() or host
    port_raw = (node.findtext("Port") or "22").strip()
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"Неверный порт у сервера «{name}»: {port_raw}.") from exc
    if port < 1 or port > 65535:
        raise ValueError(f"Неверный порт у сервера «{name}»: {port}.")

    logontype = (node.findtext("Logontype") or "0").strip()
    login = (node.findtext("User") or "").strip()
    password = _decode_password(node.find("Pass"))

    if logontype == "1" and not login:
        login = "root"
    if not login:
        login = "root"

    return FileZillaImportedServer(
        name=name,
        ip=host,
        port=port,
        login=login,
        password=password,
        group_name=group_name,
    )


def _walk_nodes(parent: ET.Element, group_name: str | None, results: list[FileZillaImportedServer]) -> None:
    for child in parent:
        if child.tag == "Server":
            results.append(_parse_server_node(child, group_name))
            continue
        if child.tag == "Folder":
            folder_name = (child.text or "").strip() or group_name
            _walk_nodes(child, folder_name or None, results)


def parse_filezilla_site_manager_xml(xml_content: str) -> list[FileZillaImportedServer]:
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        raise ValueError("Файл не является корректным XML FileZilla.") from exc

    if root.tag != "FileZilla3":
        raise ValueError("Ожидается корневой элемент FileZilla3.")

    servers_root = root.find("Servers")
    if servers_root is None:
        raise ValueError("В XML FileZilla отсутствует блок Servers.")

    results: list[FileZillaImportedServer] = []
    _walk_nodes(servers_root, None, results)
    if not results:
        raise ValueError("В XML FileZilla не найдено ни одного сервера.")
    return results
