import {
  LayoutDashboard, Building2, Cpu, Users, Radio, Settings, UserPlus, MonitorDot,
  type LucideIcon,
} from 'lucide-react';
import type { PanelView, UserRole } from './types';

export interface NavItem {
  view: PanelView;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export const NAV_BY_ROLE: Record<UserRole, NavSection[]> = {
  admin: [
    {
      heading: 'Overview',
      items: [
        { view: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Global systems overview' },
      ],
    },
    {
      heading: 'Manage',
      items: [
        { view: 'organizations', label: 'Organizations', icon: Building2, desc: 'Client enterprises' },
        { view: 'devices',       label: 'Devices',       icon: Cpu,       desc: 'Hardware registry & tokens' },
        { view: 'members',       label: 'Members',       icon: Users,     desc: 'All platform accounts' },
      ],
    },
    {
      heading: 'Tools',
      items: [
        { view: 'simulation', label: 'Telemetry Simulator', icon: Radio, desc: 'Mock SIM800L posts' },
      ],
    },
  ],
  manager: [
    {
      heading: 'Overview',
      items: [
        { view: 'manager-dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Your organization' },
      ],
    },
    {
      heading: 'Manage',
      items: [
        { view: 'devices',      label: 'Devices',      icon: Cpu,      desc: 'Your org hardware' },
        { view: 'team',         label: 'Team',         icon: UserPlus, desc: 'Members & access' },
        { view: 'org-settings', label: 'Organization', icon: Settings, desc: 'Org details' },
      ],
    },
  ],
  viewer: [
    {
      heading: 'Monitoring',
      items: [
        { view: 'viewer-devices', label: 'Live Monitoring', icon: MonitorDot, desc: 'Assigned devices' },
      ],
    },
  ],
};
