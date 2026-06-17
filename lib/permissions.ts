import type { AppUser, Permission, UserRole } from './types';

// Default permission sets for the three built-in base roles.
const BASE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'devices:read', 'devices:write',
    'alarms:read', 'alarms:acknowledge', 'alarms:configure',
    'members:read', 'members:invite', 'members:manage',
    'org:read', 'org:write',
    'reports:export',
    'dashboard:customize',
  ],
  manager: [
    'devices:read', 'devices:write',
    'alarms:read', 'alarms:acknowledge', 'alarms:configure',
    'members:read', 'members:invite',
    'org:read', 'org:write',
    'reports:export',
    'dashboard:customize',
  ],
  viewer: [
    'devices:read',
    'alarms:read', 'alarms:acknowledge',
    'members:read',
    'org:read',
    'dashboard:customize',
  ],
};

/**
 * Returns true if the user holds the given permission.
 * Resolves base-role defaults merged with any custom-role permissions
 * already loaded onto user.permissions by AppContext.
 */
export function hasPermission(user: AppUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  // Custom permissions take priority if loaded; fall back to base role.
  const perms = user.permissions ?? BASE_PERMISSIONS[user.role] ?? [];
  return perms.includes(permission);
}

/** Convenience: all permissions for a base role. */
export function getBasePermissions(role: UserRole): Permission[] {
  return BASE_PERMISSIONS[role] ?? [];
}

/** Merge base-role defaults with an extra set (for custom roles that extend a base). */
export function mergePermissions(base: UserRole, extras: Permission[]): Permission[] {
  const merged = new Set<Permission>([...BASE_PERMISSIONS[base], ...extras]);
  return Array.from(merged);
}

export const ALL_PERMISSIONS: { key: Permission; label: string; description: string }[] = [
  { key: 'devices:read',        label: 'View Devices',        description: 'View devices and telemetry data' },
  { key: 'devices:write',       label: 'Manage Devices',      description: 'Create, edit, and delete devices' },
  { key: 'alarms:read',         label: 'View Alarms',         description: 'See alarm notifications' },
  { key: 'alarms:acknowledge',  label: 'Acknowledge Alarms',  description: 'Mark alarms as acknowledged' },
  { key: 'alarms:configure',    label: 'Configure Alarms',    description: 'Create and edit threshold alarm rules' },
  { key: 'members:read',        label: 'View Members',        description: 'See team member directory' },
  { key: 'members:invite',      label: 'Invite Members',      description: 'Send email invitations to new members' },
  { key: 'members:manage',      label: 'Manage Members',      description: 'Edit and deactivate team members' },
  { key: 'org:read',            label: 'View Organization',   description: 'View organization settings' },
  { key: 'org:write',           label: 'Edit Organization',   description: 'Edit organization name and settings' },
  { key: 'reports:export',      label: 'Export Reports',      description: 'Download CSV and generate reports' },
  { key: 'dashboard:customize', label: 'Customize Dashboard', description: 'Save personal dashboard layouts' },
];
