'use client';

import { useState } from 'react';
import {
  Building2, Save, Calendar, Cpu, Users, Hash, Check, MessageSquare,
  Phone, Plus, Trash2, Clock, ShieldCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { CopyButton } from '@/components/shared/CopyButton';
import { cn } from '@/lib/utils';
import type { AlarmType, Organization } from '@/lib/types';

const ALARM_TYPES: { type: AlarmType; label: string; defaultMsg: string }[] = [
  { type: 'no_naclo',            label: 'NaClO depleted',     defaultMsg: 'Ever Spark: NaClO depleted on {device} at {time}' },
  { type: 'production_complete', label: 'Production complete', defaultMsg: 'Ever Spark: production complete on {device} at {time}' },
];

export function OrgSettings() {
  const { currentUser, organizations, devices, profiles, updateOrg } = useApp();
  const org = organizations.find((o) => o.id === currentUser.organization_id);
  const [name, setName] = useState(org?.name ?? '');
  const [saved, setSaved] = useState(false);

  if (!org) return <div className="card p-12 text-center text-slate-400">No organization found.</div>;

  const deviceCount = devices.filter((d) => d.organization_id === org.id).length;
  const memberCount = profiles.filter((p) => p.organization_id === org.id).length;
  const dirty = name.trim() !== org.name && name.trim().length > 0;

  const save = () => {
    if (!dirty) return;
    updateOrg(org.id, name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-accent-50 text-accent-600 ring-4 ring-accent-50/60">
          <Building2 size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Organization Settings</h2>
          <p className="text-sm text-slate-500">Manage details for your organization</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <Cpu size={16} className="text-brand-600" />
          <p className="mt-2 text-2xl font-bold text-ink">{deviceCount}</p>
          <p className="text-xs text-slate-400">Devices</p>
        </div>
        <div className="card p-4">
          <Users size={16} className="text-violet-600" />
          <p className="mt-2 text-2xl font-bold text-ink">{memberCount}</p>
          <p className="text-xs text-slate-400">Members</p>
        </div>
        <div className="card p-4">
          <Calendar size={16} className="text-accent-600" />
          <p className="mt-2 text-sm font-bold text-ink">{new Date(org.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          <p className="text-xs text-slate-400">Created</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Organization name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1.5" />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">Organization ID</span>
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="font-mono text-sm text-slate-500 flex items-center gap-2"><Hash size={14} className="text-slate-400" />{org.id}</span>
            <CopyButton value={org.id} label="Copy" />
          </div>
          <p className="mt-1 text-xs text-slate-400">Used for RLS tenancy scoping. Read-only.</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check size={15} /> Saved</span>}
          <button onClick={save} disabled={!dirty} className="btn-primary"><Save size={15} /> Save changes</button>
        </div>
      </div>

      <SmsAlertsCard org={org} />
    </div>
  );
}

function SmsAlertsCard({ org }: { org: Organization }) {
  const {
    smsSettings, smsRecipients, smsTemplates,
    requestOrgSms, addSmsRecipient, updateSmsRecipient, deleteSmsRecipient, upsertSmsTemplate,
  } = useApp();

  const setting = smsSettings.find((s) => s.organization_id === org.id);
  const status = setting?.status ?? 'none';
  const enabled = setting?.enabled ?? false;

  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [phoneErr, setPhoneErr] = useState('');

  const addNumber = () => {
    const p = phone.trim();
    if (!/^\+\d{8,15}$/.test(p)) { setPhoneErr('Use international format, e.g. +251912345678'); return; }
    setPhoneErr('');
    addSmsRecipient(p, label.trim());
    setPhone(''); setLabel('');
  };

  const numbers = smsRecipients.filter((r) => r.organization_id === org.id);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-600"><MessageSquare size={18} /></span>
          <div>
            <h3 className="text-sm font-bold text-ink">SMS Alerts</h3>
            <p className="text-xs text-slate-400">Text operators when a device raises an alarm</p>
          </div>
        </div>
        {status === 'pending' && <span className="chip bg-amber-50 text-amber-700"><Clock size={12} /> Pending approval</span>}
        {enabled && <span className="chip bg-emerald-50 text-emerald-700"><ShieldCheck size={12} /> Enabled</span>}
        {status === 'denied' && !enabled && <span className="chip bg-rose-50 text-rose-600">Denied</span>}
      </div>

      {/* Not yet enabled → request flow */}
      {!enabled && (
        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4">
          {status === 'pending' ? (
            <p className="text-sm text-slate-500">Your request is awaiting Super Admin approval. You&apos;ll be able to add operator numbers once it&apos;s approved.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                SMS alerts require Super Admin activation. {status === 'denied' && 'Your last request was denied — you can request again.'}
              </p>
              <button onClick={requestOrgSms} className="btn-primary mt-3">
                <MessageSquare size={15} /> Request SMS alerts
              </button>
            </>
          )}
        </div>
      )}

      {/* Enabled → manage operator numbers + templates */}
      {enabled && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Operator numbers</p>
            <div className="space-y-2">
              {numbers.length === 0 && <p className="text-xs text-slate-400">No numbers yet — add one below.</p>}
              {numbers.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span className="font-mono text-sm text-ink">{r.phone_e164}</span>
                  {r.label && <span className="text-xs text-slate-400 truncate">· {r.label}</span>}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      role="switch" aria-checked={r.enabled}
                      onClick={() => updateSmsRecipient(r.id, { enabled: !r.enabled })}
                      title={r.enabled ? 'Disable' : 'Enable'}
                      className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer shrink-0', r.enabled ? 'bg-brand-600' : 'bg-slate-300')}
                    >
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', r.enabled ? 'left-[18px]' : 'left-0.5')} />
                    </button>
                    <button onClick={() => deleteSmsRecipient(r.id)} className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-rose-500" title="Remove"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251912345678" className="input font-mono sm:w-48" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="input flex-1" />
              <button onClick={addNumber} className="btn-secondary whitespace-nowrap"><Plus size={15} /> Add</button>
            </div>
            {phoneErr && <p className="mt-1 text-xs text-rose-500">{phoneErr}</p>}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Message templates</p>
            <p className="text-xs text-slate-400 mb-3">Placeholders: <code className="text-slate-500">{'{device}'}</code> <code className="text-slate-500">{'{detail}'}</code> <code className="text-slate-500">{'{time}'}</code> <code className="text-slate-500">{'{alarm}'}</code></p>
            <div className="space-y-3">
              {ALARM_TYPES.map(({ type, label: tlabel, defaultMsg }) => {
                const existing = smsTemplates.find((t) => t.organization_id === org.id && t.alarm_type === type);
                return <TemplateEditor key={type} alarmType={type} title={tlabel} defaultMsg={defaultMsg}
                  initial={existing?.message ?? defaultMsg} initialEnabled={existing?.enabled ?? true} onSave={upsertSmsTemplate} />;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ alarmType, title, defaultMsg, initial, initialEnabled, onSave }: {
  alarmType: AlarmType; title: string; defaultMsg: string;
  initial: string; initialEnabled: boolean;
  onSave: (t: AlarmType, message: string, enabled: boolean) => void;
}) {
  const [msg, setMsg] = useState(initial);
  const [on, setOn] = useState(initialEnabled);
  const [saved, setSaved] = useState(false);
  const save = () => { onSave(alarmType, msg.trim() || defaultMsg, on); setSaved(true); setTimeout(() => setSaved(false), 1600); };

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <button
          role="switch" aria-checked={on} onClick={() => setOn((v) => !v)}
          className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer', on ? 'bg-brand-600' : 'bg-slate-300')}
          title={on ? 'SMS on for this alarm' : 'SMS off for this alarm'}
        >
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
        </button>
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} className="input text-sm resize-none" />
      <div className="mt-2 flex items-center justify-end gap-2">
        {saved && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check size={13} /> Saved</span>}
        <button onClick={save} className="btn-secondary text-xs py-1.5"><Save size={13} /> Save</button>
      </div>
    </div>
  );
}
