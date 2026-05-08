export type NavGroup = "overview" | "infrastructure" | "operations" | "security" | "administration";

export type SectionItem = {
  path: string;
  label: string;
  description: string;
  adminOnly?: boolean;
  group: NavGroup;
};
