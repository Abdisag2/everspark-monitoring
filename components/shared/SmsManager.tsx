'use client';

import { useState } from 'react';
import {
  MessageSquare, Phone, Plus, Trash2, Clock, ShieldCheck, Check, Save, Cpu,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import type { AlarmType, Organization, SmsRecipient } from '@/lib/types';

const ALARM_TYPES: { type: AlarmType; label: string; defaultMsg: string }[] = [
  { type: 'no_naclo',            label: 'NaClO depleted',      defaultMsg: 'Ever Spark: NaClO depleted on {device} at {time}' },
  { type: 'production_complete', label: 'Production complete',  defaultMsg: 'Ever Spark: production complete on {device} at {time}' },
];

/** SMS alerts panel for one org. `isAdmin` unlocks approve/enable/disable controls. */
export function SmsManager({ org, isAdmin }: { org: Organization; isAdmin: boolean }) {
  const {
    smsSettings, smsRecipients, smsTemplates, devices,
    requestOrgSms, reviewOrgSms, addSmsRecipient, upsertSmsTemplate,
  } = useApp();

  const setting = smsSettings.find((s) => s.organization_id === org.id);
  const status = setting?.status ?? 'none';
  const enabled = setting?.enabled ?? false;

  const orgDevices = devices.filter((d) => d.organization_id === org.id);
  const numbers = smsRecipients.filter((r) => r.organization_id === org.id);

  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [phoneErr, setPhoneErr] = useState('');

  const addNumber = () => {
    const p = phone.trim();
    if (!/^\+\d{8,15}$/.test(p)) { setPhoneErr('Use international format, e.g. +251912345678'); return; }
    setPhoneErr('');
    addSmsRecipient(org.id, p, label.trim());
    setPhone(''); setLabel('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-600"><MessageSquare size={18} /></span>
          <div>
            <h3 className="text-sm font-bold text-ink">SMS Alerts</h3>
            <p className="text-xs text-slate-400">Text operators when a device raises an alarm</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'pending' && <span className="chip bg-amber-50 text-amber-700"><Clock size={12} /> Pending</span>}
          {enabled && <span className="chip bg-emerald-50 text-emerald-700"><ShieldCheck size={12} /> Enabled</span>}
          {status === 'denied' && !enabled && <span className="chip bg-rose-50 text-rose-600">Denied</span>}
          {isAdmin && enabled && (
            <button onClick={() => reviewOrgSms(org.id, false)} className="btn-ghost text-xs text-slate-400 hover:text-rose-500">Disable</button>
          )}
        </div>
      </div>

      {/* Not enabled */}
      {!enabled && (
        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4">
          {isAdmin ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {status === 'pending' ? 'This organization requested SMS alerts.' : 'SMS alerts are off for this organization.'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {status === 'pending' && (
                  <button onClick={() => reviewOrgSms(org.id, false)} className="btn-outline text-xs">Deny</button>
                )}
                <button onClick={() => reviewOrgSms(org.id, true)} className="btn-primary text-xs">
                  <Check size={14} /> {status === 'pending' ? 'Approve' : 'Enable'}
                </button>
              </div>
            </div>
          ) : status === 'pending' ? (
            <p className="text-sm text-slate-500">Your request is awaiting Super Admin approval.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">SMS alerts require Super Admin activation. {status === 'denied' && 'Your last request was denied — you can request again.'}</p>
              <button onClick={requestOrgSms} className="btn-primary mt-3"><MessageSquare size={15} /> Request SMS alerts</button>
            </>
          )}
        </div>
      )}

      {/* Enabled → operator numbers + templates */}
      {enabled && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Operator numbers</p>
            <div className="space-y-2">
              {numbers.length === 0 && <p className="text-xs text-slate-400">No numbers yet — add one below.</p>}
              {numbers.map((r) => <RecipientRow key={r.id} recipient={r} orgDevices={orgDevices} />)}
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
                return <TemplateEditor key={type} orgId={org.id} alarmType={type} title={tlabel} defaultMsg={defaultMsg}
                  initial={existing?.message ?? defaultMsg} initialEnabled={existing?.enabled ?? true} onSave={upsertSmsTemplate} />;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecipientRow({ recipient: r, orgDevices }: { recipient: SmsRecipient; orgDevices: { id: string; name: string }[] }) {
  const { smsRecipientDevices, updateSmsRecipient, deleteSmsRecipient, assignSmsRecipientDevices } = useApp();
  const linked = new Set(smsRecipientDevices.filter((x) => x.recipient_id === r.id).map((x) => x.device_id));

  const toggleDevice = (id: string) => {
    const next = new Set(linked);
    if (next.has(id)) next.delete(id); else next.add(id);
    assignSmsRecipientDevices(r.id, [...next]);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Phone size={14} className="text-slate-400 shrink-0" />
        <span className="font-mono text-sm text-ink">{r.phone_e164}</span>
        {r.label && <span className="text-xs text-slate-400 truncate">· {r.label}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            role="switch" aria-checked={r.enabled}
            onClick={() => updateSmsRecipient(r.id, { enabled: !r.enabled })}
            title={r.enabled ? 'Disable number' : 'Enable number'}
            className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer shrink-0', r.enabled ? 'bg-brand-600' : 'bg-slate-300')}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', r.enabled ? 'left-[18px]' : 'left-0.5')} />
          </button>
          <button onClick={() => deleteSmsRecipient(r.id)} className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-rose-500" title="Remove"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Device scope */}
      <div className="flex gap-2">
        <button
          onClick={() => updateSmsRecipient(r.id, { all_devices: true })}
          className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
            r.all_devices ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-500 hover:bg-slate-50')}
        >All devices</button>
        <button
          onClick={() => updateSmsRecipient(r.id, { all_devices: false })}
          className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
            !r.all_devices ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-500 hover:bg-slate-50')}
        >Selected devices</button>
      </div>

      {!r.all_devices && (
        <div className="flex flex-wrap gap-1.5">
          {orgDevices.length === 0 && <span className="text-xs text-slate-400">No devices in this org.</span>}
          {orgDevices.map((d) => (
            <button
              key={d.id}
              onClick={() => toggleDevice(d.id)}
              className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                linked.has(d.id) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
            >
              <Cpu size={11} /> {d.name}
            </button>
          ))}
          {!r.all_devices && linked.size === 0 && <span className="text-[11px] text-amber-600 w-full">Pick at least one device.</span>}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ orgId, alarmType, title, defaultMsg, initial, initialEnabled, onSave }: {
  orgId: string; alarmType: AlarmType; title: string; defaultMsg: string;
  initial: string; initialEnabled: boolean;
  onSave: (orgId: string, t: AlarmType, message: string, enabled: boolean) => void;
}) {
  const [msg, setMsg] = useState(initial);
  const [on, setOn] = useState(initialEnabled);
  const [saved, setSaved] = useState(false);
  const save = () => { onSave(orgId, alarmType, msg.trim() || defaultMsg, on); setSaved(true); setTimeout(() => setSaved(false), 1600); };

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
