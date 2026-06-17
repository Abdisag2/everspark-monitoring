'use client';

import { useState } from 'react';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, X, Save } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { AlarmBadge } from '@/components/shared/AlarmBadge';
import type { AlarmRule, AlarmCondition, AlarmSeverity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PARAMETER_META } from '@/lib/types';

const CONDITION_LABELS: Record<AlarmCondition, string> = {
  lt: '< less than', lte: '≤ at most', gt: '> greater than', gte: '≥ at least', eq: '= equal to',
};

const CONDITION_SHORT: Record<AlarmCondition, string> = {
  lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=',
};

const ANALOG_PARAMS = PARAMETER_META.filter((p) => p.kind === 'analog').map((p) => p.key);

interface RuleForm {
  parameter: string;
  condition: AlarmCondition;
  threshold: string;
  severity: AlarmSeverity;
  label: string;
  device_id: string;
}

const EMPTY_FORM: RuleForm = {
  parameter: 'ph_value',
  condition: 'lt',
  threshold: '',
  severity: 'warning',
  label: '',
  device_id: '',
};

export function AlarmRules() {
  const { alarmRules, addAlarmRule, updateAlarmRule, deleteAlarmRule, currentUser, getVisibleDevices } = useApp();
  const devices = getVisibleDevices();

  const orgRules = alarmRules.filter((r) => r.org_id === currentUser.organization_id);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(rule: AlarmRule) {
    setEditingId(rule.id);
    setForm({
      parameter: rule.parameter,
      condition: rule.condition,
      threshold: String(rule.threshold),
      severity: rule.severity,
      label: rule.label ?? '',
      device_id: rule.device_id ?? '',
    });
    setShowForm(true);
  }

  function handleSave() {
    const threshold = parseFloat(form.threshold);
    if (isNaN(threshold)) return;
    const base = {
      org_id: currentUser.organization_id!,
      device_id: form.device_id || null,
      parameter: form.parameter,
      condition: form.condition,
      threshold,
      severity: form.severity,
      label: form.label || null,
      is_active: true,
      created_by: currentUser.id,
    };
    if (editingId) {
      updateAlarmRule(editingId, base);
    } else {
      addAlarmRule(base);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const paramLabel = (key: string) => PARAMETER_META.find((p) => p.key === key)?.label ?? key;
  const paramUnit  = (key: string) => PARAMETER_META.find((p) => p.key === key)?.unit ?? '';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Alarm Rules</h2>
          <p className="text-sm text-slate-500">Define threshold-based alerts for your devices</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> New Rule
        </button>
      </div>

      {/* Rule form */}
      {showForm && (
        <div className="card p-5 border-brand-200 bg-brand-50/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">{editingId ? 'Edit Rule' : 'New Alarm Rule'}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Parameter */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Parameter</label>
              <select value={form.parameter} onChange={(e) => setForm((f) => ({ ...f, parameter: e.target.value }))} className="input w-full">
                {ANALOG_PARAMS.map((key) => (
                  <option key={key} value={key}>{paramLabel(key)} {paramUnit(key) ? `(${paramUnit(key)})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Condition</label>
              <select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value as AlarmCondition }))} className="input w-full">
                {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Threshold */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Threshold {paramUnit(form.parameter) ? `(${paramUnit(form.parameter)})` : ''}
              </label>
              <input
                type="number"
                step="0.1"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                placeholder="e.g. 6.5"
                className="input w-full"
              />
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as AlarmSeverity }))} className="input w-full">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Label */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Label (optional)</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Low pH alert"
                className="input w-full"
              />
            </div>

            {/* Device scope */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Apply to</label>
              <select value={form.device_id} onChange={(e) => setForm((f) => ({ ...f, device_id: e.target.value }))} className="input w-full">
                <option value="">All devices in org</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Preview */}
          {form.threshold && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-medium">Preview:</span>{' '}
              Raise a{' '}
              <AlarmBadge severity={form.severity} className="mx-1" />{' '}
              alarm when <span className="font-medium">{paramLabel(form.parameter)}</span>{' '}
              is <span className="font-medium">{CONDITION_SHORT[form.condition]} {form.threshold} {paramUnit(form.parameter)}</span>
              {form.label ? ` — "${form.label}"` : ''}.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
            <button onClick={handleSave} disabled={!form.threshold} className="btn-primary flex items-center gap-1.5 text-sm">
              <Save size={14} /> {editingId ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {orgRules.length === 0 && !showForm ? (
        <div className="card p-12 grid place-items-center text-center">
          <Bell size={28} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No alarm rules configured yet.</p>
          <p className="text-xs text-slate-400">Click "New Rule" to set your first threshold alert.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Active Rules</h3>
            <span className="chip bg-slate-100 text-slate-600">{orgRules.length}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {orgRules.map((rule) => {
              const device = devices.find((d) => d.id === rule.device_id);
              return (
                <div key={rule.id} className={cn('flex items-center gap-4 px-5 py-4', !rule.is_active && 'opacity-50')}>
                  <AlarmBadge severity={rule.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {rule.label || `${paramLabel(rule.parameter)} ${CONDITION_SHORT[rule.condition]} ${rule.threshold}${paramUnit(rule.parameter) ? ' ' + paramUnit(rule.parameter) : ''}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {paramLabel(rule.parameter)} {CONDITION_SHORT[rule.condition]} {rule.threshold} {paramUnit(rule.parameter)}
                      {' · '}{device ? device.name : 'All devices'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateAlarmRule(rule.id, { is_active: !rule.is_active })}
                      className="text-slate-400 hover:text-brand-600 transition-colors"
                      title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.is_active ? <ToggleRight size={20} className="text-brand-500" /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => openEdit(rule)} className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => deleteAlarmRule(rule.id)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
