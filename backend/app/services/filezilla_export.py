import base64
import xml.etree.ElementTree as ET
from collections import defaultdict

from app.core.security import decrypt_secret
from app.models import Server

FILEZILLA_VERSION = "3.69.6"
FILEZILLA_PLATFORM = "windows"


def _encode_password(password: str) -> str:
    return base64.b64encode(password.encode("utf-8")).decode("ascii")


def _append_server(parent: ET.Element, server: Server, password: str | None) -> None:
    node = ET.SubElement(parent, "Server")
    ET.SubElement(node, "Host").text = server.ip
    ET.SubElement(node, "Port").text = str(server.port or 22)
    ET.SubElement(node, "Protocol").text = "1"
    ET.SubElement(node, "Type").text = "0"
    ET.SubElement(node, "User").text = server.login
    if password:
        pass_el = ET.SubElement(node, "Pass", encoding="base64")
        pass_el.text = _encode_password(password)
        ET.SubElement(node, "Logontype").text = "1"
    else:
        ET.SubElement(node, "Logontype").text = "0"
    ET.SubElement(node, "EncodingType").text = "Auto"
    ET.SubElement(node, "BypassProxy").text = "0"
    ET.SubElement(node, "Name").text = server.name
    ET.SubElement(node, "SyncBrowsing").text = "0"
    ET.SubElement(node, "DirectoryComparison").text = "0"


def build_filezilla_site_manager_xml(servers: list[Server]) -> str:
    root = ET.Element("FileZilla3", version=FILEZILLA_VERSION, platform=FILEZILLA_PLATFORM)
    servers_root = ET.SubElement(root, "Servers")

    grouped: dict[str, list[Server]] = defaultdict(list)
    ungrouped: list[Server] = []
    for server in servers:
        group_name = server.group.name.strip() if server.group and server.group.name else ""
        if group_name:
            grouped[group_name].append(server)
        else:
            ungrouped.append(server)

    def sort_key(server: Server) -> str:
        return server.name.casefold()

    for server in sorted(ungrouped, key=sort_key):
        password = decrypt_secret(server.password_enc) if server.password_enc else None
        _append_server(servers_root, server, password)

    for group_name in sorted(grouped.keys(), key=str.casefold):
        folder = ET.SubElement(servers_root, "Folder", expanded="1")
        folder.text = group_name
        for server in sorted(grouped[group_name], key=sort_key):
            password = decrypt_secret(server.password_enc) if server.password_enc else None
            _append_server(folder, server, password)

    ET.indent(root, space="\t")
    xml_body = ET.tostring(root, encoding="unicode")
    return f'<?xml version="1.0"?>\n{xml_body}\n'
