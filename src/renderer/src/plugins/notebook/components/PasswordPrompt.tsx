import { useState } from 'react'
import { Shield, Eye, EyeOff, X, AlertCircle } from 'lucide-react'

interface PasswordPromptProps {
  purpose: 'unlock' | 'setup'
  error?: string | null
  onSubmit: (password: string) => void
  onCancel: () => void
}

export default function PasswordPrompt({ purpose, error, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const isSetup = purpose === 'setup'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!password.trim()) return
    if (isSetup && password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }
    if (isSetup && password.length < 4) {
      setLocalError('Password must be at least 4 characters')
      return
    }
    onSubmit(password)
  }

  const displayError = localError ?? error

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-surface-700 bg-surface-800 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              {isSetup ? 'Set Password' : 'Encrypted Document'}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-400">
          {isSetup
            ? 'Choose a password to encrypt this document. You will need this password every time you open the document.'
            : 'This document is encrypted. Enter the password to view its content.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="relative mb-3">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetup ? 'New password...' : 'Enter password...'}
              autoFocus
              className="w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {isSetup && (
            <div className="mb-3">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password..."
                className="w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {displayError && (
            <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {displayError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password.trim() || (isSetup && !confirmPassword.trim())}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSetup ? 'Encrypt' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
