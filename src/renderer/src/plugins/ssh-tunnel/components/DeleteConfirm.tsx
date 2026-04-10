import { AlertTriangle, X } from 'lucide-react'

interface DeleteConfirmProps {
  tunnelName: string
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirm({ tunnelName, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-surface-800 border border-surface-700 p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Delete tunnel</h3>
            <p className="mt-1 text-sm text-slate-400">
              Are you sure you want to delete{' '}
              <span className="font-medium text-slate-200">{tunnelName}</span>? This action cannot
              be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
