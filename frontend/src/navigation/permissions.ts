import type { User } from "../types";

export function userHasSectionAccess(user: User | null, section: string) {
  if (!user) {
    return false;
  }
  if (user.role === "admin") {
    return true;
  }
  const perms = user.section_permissions;
  if (perms.includes(section)) {
    return true;
  }
  if (section === "pm2" && perms.includes("tmux")) {
    return true;
  }
  if (section === "metric-embeds" && perms.includes("servers")) {
    return true;
  }
  return false;
}
