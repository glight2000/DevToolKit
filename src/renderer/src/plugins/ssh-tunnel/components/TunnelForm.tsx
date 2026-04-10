import { useState, useEffect } from 'react'
import {
  X,
  FolderOpen,
  Server,
  ArrowRight,
  Globe,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react'
import type { TunnelInfo, TunnelType, TunnelConfig } from '../../../types'

interface TunnelFormProps {
  tunnel?: TunnelInfo | null
  onSave: (config: Partial<TunnelConfig>) => void
  onClose: () => void
}

const defaultForm: Omit<TunnelConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  remarks: '',
  type: 'local',
  sshHost: '',
  sshPort: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: '',
  passphrase: '',
  localHost: 'localhost',
  localPort: 0,
  remoteHost: 'localhost',
  remotePort: 0,
  autoStart: false,
  autoReconnect: true,
  keepAliveInterval: 30
}

const tunnelTypeOptions: { value: TunnelType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'local',
    label: 'Local Forward',
    desc: 'Forward a local port to a remote destination through SSH',
    icon: <ArrowRight className="h-4 w-4" />
  },
  {
    value: 'remote',
    label: 'Remote Forward',
    desc: 'Forward a remote port back to a local destination',
    icon: <ArrowUpDown className="h-4 w-4" />
  },
  {
    value: 'dynamic',
    label: 'Dynamic (SOCKS5)',
    desc: 'Create a SOCKS5 proxy through the SSH server',
    icon: <Globe className="h-4 w-4" />
  }
]

export default function TunnelForm({ tunnel, onSave, onClose }: TunnelFormProps) {
  const isEditing = !!tunnel
  const [form, setForm] = useState(defaultForm)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (tunnel) {
      const { id, createdAt, updatedAt, ...rest } = tunnel.config
      setForm(rest)
    }
  }, [tunnel])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: false }))
  }

  const validate = (): boolean => {
    const required: (keyof typeof form)[] = ['name', 'sshHost', 'username']
    if (form.type !== 'dynamic') {
      required.push('localPort', 'remotePort')
    } else {
      required.push('localPort')
    }
    const newErrors: Record<string, boolean> = {}
    for (const key of required) {
      const val = form[key]
      if (val === '' || val === 0 || val === undefined) {
        newErrors[key] = true
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    const payload: Partial<TunnelConfig> = { ...form }
    if (isEditing) {
      payload.id = tunnel!.config.id
    }
    onSave(payload)
  }

  const handleBrowseKey = async () => {
    const result = await window.api.invoke('tunnel:import-key')
    if (result && !result.canceled && result.filePath) {
      set('privateKeyPath', result.filePath)
    }
  }

  const inputCls = (key: string) =>
    `w-full rounded-lg border bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[key] ? 'border-red-500' : 'border-surface-600'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-surface-700 bg-surface-800 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {isEditing ? 'Edit Tunnel' : 'New Tunnel'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5 space-y-6">
          {/* Basic Info */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-slate-300 uppercase tracking-wider">
              Basic Info
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  className={inputCls('name')}
                  placeholder="My Database Tunnel"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Remarks</label>
                <textarea
                  className={`${inputCls('remarks')} resize-none`}
                  rows={2}
                  placeholder="Optional description..."
                  value={form.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Tunnel Type */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-slate-300 uppercase tracking-wider">
              Tunnel Type
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {tunnelTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('type', opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 ${
                    form.type === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-surface-600 bg-surface-700 text-slate-400 hover:border-surface-500'
                  }`}
                >
                  {opt.icon}
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[10px] leading-tight text-slate-500">{opt.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* SSH Connection */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-slate-300 uppercase tracking-wider">
              SSH Connection
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs text-slate-400">
                  Host <span className="text-red-400">*</span>
                </label>
                <input
                  className={inputCls('sshHost')}
                  placeholder="example.com"
                  value={form.sshHost}
                  onChange={(e) => set('sshHost', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Port</label>
                <input
                  className={inputCls('sshPort')}
                  type="number"
                  min={1}
                  max={65535}
                  value={form.sshPort}
                  onChange={(e) => set('sshPort', Number(e.target.value))}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs text-slate-400">
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  className={inputCls('username')}
                  placeholder="root"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Auth Type</label>
                <div className="relative">
                  <select
                    className={`${inputCls('authType')} appearance-none pr-8`}
                    value={form.authType}
                    onChange={(e) => set('authType', e.target.value as 'password' | 'privateKey')}
                  >
                    <option value="password">Password</option>
                    <option value="privateKey">Private Key</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>

            {form.authType === 'password' ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-400">Password</label>
                <input
                  className={inputCls('password')}
                  type="password"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Private Key Path</label>
                  <div className="flex gap-2">
                    <input
                      className={`${inputCls('privateKeyPath')} flex-1`}
                      placeholder="/home/user/.ssh/id_rsa"
                      value={form.privateKeyPath}
                      onChange={(e) => set('privateKeyPath', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseKey}
                      className="shrink-0 rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-300 transition-all duration-200 hover:bg-surface-600"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Passphrase</label>
                  <input
                    className={inputCls('passphrase')}
                    type="password"
                    placeholder="Optional passphrase"
                    value={form.passphrase}
                    onChange={(e) => set('passphrase', e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Forwarding */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-slate-300 uppercase tracking-wider">
              Forwarding
            </h3>
            {form.type === 'dynamic' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Local Host</label>
                  <input
                    className={inputCls('localHost')}
                    placeholder="localhost"
                    value={form.localHost}
                    onChange={(e) => set('localHost', e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Local Port <span className="text-red-400">*</span>
                  </label>
                  <input
                    className={inputCls('localPort')}
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="1080"
                    value={form.localPort || ''}
                    onChange={(e) => set('localPort', Number(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.type === 'local' ? 'Local Host' : 'Remote Host'}
                    </label>
                    <input
                      className={inputCls(form.type === 'local' ? 'localHost' : 'remoteHost')}
                      placeholder="localhost"
                      value={form.type === 'local' ? form.localHost : form.remoteHost}
                      onChange={(e) =>
                        set(form.type === 'local' ? 'localHost' : 'remoteHost', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.type === 'local' ? 'Local Port' : 'Remote Port'}{' '}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputCls(form.type === 'local' ? 'localPort' : 'remotePort')}
                      type="number"
                      min={1}
                      max={65535}
                      placeholder="8080"
                      value={
                        (form.type === 'local' ? form.localPort : form.remotePort) || ''
                      }
                      onChange={(e) =>
                        set(
                          form.type === 'local' ? 'localPort' : 'remotePort',
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.type === 'local' ? 'Remote Host' : 'Local Host'}
                    </label>
                    <input
                      className={inputCls(form.type === 'local' ? 'remoteHost' : 'localHost')}
                      placeholder="localhost"
                      value={form.type === 'local' ? form.remoteHost : form.localHost}
                      onChange={(e) =>
                        set(form.type === 'local' ? 'remoteHost' : 'localHost', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.type === 'local' ? 'Remote Port' : 'Local Port'}{' '}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputCls(form.type === 'local' ? 'remotePort' : 'localPort')}
                      type="number"
                      min={1}
                      max={65535}
                      placeholder="3306"
                      value={
                        (form.type === 'local' ? form.remotePort : form.localPort) || ''
                      }
                      onChange={(e) =>
                        set(
                          form.type === 'local' ? 'remotePort' : 'localPort',
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Options */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-slate-300 uppercase tracking-wider">
              Options
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-lg bg-surface-700 px-4 py-3 cursor-pointer">
                <div>
                  <div className="text-sm text-slate-200">Auto-start</div>
                  <div className="text-xs text-slate-500">Start this tunnel when the app launches</div>
                </div>
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    form.autoStart ? 'bg-blue-600' : 'bg-surface-600'
                  }`}
                  onClick={() => set('autoStart', !form.autoStart)}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      form.autoStart ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between rounded-lg bg-surface-700 px-4 py-3 cursor-pointer">
                <div>
                  <div className="text-sm text-slate-200">Auto-reconnect</div>
                  <div className="text-xs text-slate-500">Reconnect automatically on connection loss</div>
                </div>
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    form.autoReconnect ? 'bg-blue-600' : 'bg-surface-600'
                  }`}
                  onClick={() => set('autoReconnect', !form.autoReconnect)}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      form.autoReconnect ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Keep-alive interval (seconds)
                </label>
                <input
                  className={inputCls('keepAliveInterval')}
                  type="number"
                  min={0}
                  max={300}
                  value={form.keepAliveInterval}
                  onChange={(e) => set('keepAliveInterval', Number(e.target.value))}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-surface-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-500"
          >
            {isEditing ? 'Update Tunnel' : 'Create Tunnel'}
          </button>
        </div>
      </div>
    </div>
  )
}
