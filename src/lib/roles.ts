// Shared role definitions (safe to import from client and server code).
export type Role = "admin" | "manager" | "developer" | "social_manager" | "marketing" | "designer" | "client";

export const STAFF_ROLES: Role[] = ["admin", "manager", "developer", "social_manager", "marketing", "designer"];

export const roleLabel: Record<Role, string> = {
  admin: "Founder / Admin",
  manager: "Manager",
  developer: "Developer",
  social_manager: "Social media manager",
  marketing: "Marketing",
  designer: "Designer",
  client: "Client",
};

export const isStaffRole = (r: Role) => r !== "client";
export const isLeadRole = (r: Role) => r === "admin" || r === "manager";
export const isAdminRole = (r: Role) => r === "admin";
