import shlex
from string import Template

from app.schemas import AutomationPresetRead
from app.services.automation_presets import AUTOMATION_PRESETS, DEFAULT_AUTOMATION_ENV


def list_automation_presets() -> list[AutomationPresetRead]:
    return [_preset_with_defaults(preset) for preset in AUTOMATION_PRESETS]


def get_automation_preset(preset_key: str) -> AutomationPresetRead:
    for preset in AUTOMATION_PRESETS:
        if preset.key == preset_key:
            return _preset_with_defaults(preset)
    raise KeyError(preset_key)


def _preset_with_defaults(preset: AutomationPresetRead) -> AutomationPresetRead:
    return preset.model_copy(update={"default_env": DEFAULT_AUTOMATION_ENV.get(preset.key, {})})


def merge_automation_env(preset_key: str, custom_env: dict[str, str]) -> dict[str, str]:
    merged = dict(DEFAULT_AUTOMATION_ENV.get(preset_key, {}))
    merged.update(custom_env)
    return merged


def render_automation_commands(preset_key: str, commands: list[str], custom_env: dict[str, str]) -> list[str]:
    template_values = merge_automation_env(preset_key, custom_env)
    rendered: list[str] = []
    export_prefix = ""
    if template_values:
        export_parts = [f"{key}={shlex.quote(value)}" for key, value in template_values.items()]
        export_prefix = "export " + " ".join(export_parts) + "; "

    for command in commands:
        prepared = Template(command).safe_substitute(template_values)
        if export_prefix:
            rendered.append("sh -lc " + shlex.quote(export_prefix + prepared))
        else:
            rendered.append(prepared)
    return rendered
