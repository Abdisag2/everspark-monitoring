'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useMounted } from '@/lib/useMounted';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { EverSparkLogo } from '@/components/brand/EverSparkLogo';

import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { OrganizationManagement } from '@/components/admin/OrganizationManagement';
import { DeviceConfiguration } from '@/components/admin/DeviceConfiguration';
import { MemberDirectory } from '@/components/admin/MemberDirectory';
import { SimulationEngine } from '@/components/admin/SimulationEngine';
import { RoleManager } from '@/components/admin/RoleManager';
import { ManagerDashboard } from '@/components/manager/ManagerDashboard';
import { OrgSettings } from '@/components/manager/OrgSettings';
import { AlarmRules } from '@/components/manager/AlarmRules';
import { DeviceList } from '@/components/viewer/DeviceList';
import { DeviceDetail } from '@/components/viewer/DeviceDetail';

export default function DashboardPage() {
  const { panelState, currentUser, authUser, authReady } = useApp();
  const mounted = useMounted();
  const router = useRouter();

  useEffect(() => {
    if (mounted && authReady && !authUser) router.replace('/login');
  }, [mounted, authReady, authUser, router]);

  if (!mounted || !authReady || !authUser) {
    return (
      <div className="grid place-items-center h-screen">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <EverSparkLogo markSize={48} />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 rounded-full bg-brand-500 shimmer" />
          </div>
        </div>
      </div>
    );
  }

  const renderPanel = () => {
    switch (panelState.view) {
      case 'admin-dashboard':   return <AdminDashboard />;
      case 'organizations':     return <OrganizationManagement />;
      case 'devices':
        return <DeviceConfiguration scopeOrgId={currentUser.role === 'admin' ? undefined : currentUser.organization_id ?? undefined} />;
      case 'members':           return <MemberDirectory />;
      case 'simulation':        return <SimulationEngine />;
      case 'roles':             return <RoleManager />;
      case 'manager-dashboard': return <ManagerDashboard />;
      case 'org-settings':      return <OrgSettings />;
      case 'alarm-rules':       return <AlarmRules />;
      case 'team':
        return <MemberDirectory scopeOrgId={currentUser.organization_id ?? undefined} allowAdminRole={false} title="Team & Access" />;
      case 'viewer-devices':    return <DeviceList />;
      case 'device-monitoring':
        return <DeviceDetail deviceId={panelState.deviceId} backView={panelState.backView} />;
      default:                  return <AdminDashboard />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <RoleSwitcher />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-5 lg:p-6">{renderPanel()}</main>
        </div>
      </div>
    </div>
  );
}
