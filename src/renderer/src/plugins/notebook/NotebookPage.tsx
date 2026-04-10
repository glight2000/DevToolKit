import { useState, useCallback, useEffect, useRef } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { useNotebook } from './hooks/useNotebook'
import DocumentTree from './components/DocumentTree'
import EditorToolbar from './components/EditorToolbar'
import MarkdownPreview from './components/MarkdownPreview'
import PasswordPrompt from './components/PasswordPrompt'
import {
  hashPassword,
  verifyPassword,
  encryptWithPassword,
  decryptWithPassword
} from './utils/crypto'

type PasswordPromptPurpose = null | 'unlock' | 'setup'

export default function NotebookPage() {
  const {
    documents,
    selectedId,
    selectedDoc,
    content,
    loading,
    contentLoading,
    passwordHash,
    selectDocument,
    createDocument,
    updateDocument,
    saveContent,
    deleteDocument,
    setLocked,
    setEncrypted,
    saveEncryptedContent
  } = useNotebook()

  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  // When a password prompt is showing, purpose tells us why
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptPurpose>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  // Unlocked password for the currently-open encrypted doc
  const [unlockedPassword, setUnlockedPassword] = useState<string | null>(null)
  // Decrypted content for the currently-open encrypted doc
  const [decryptedContent, setDecryptedContent] = useState<string>('')
  // Track which doc id the decryptedContent/unlockedPassword belong to
  const unlockedDocIdRef = useRef<string | null>(null)
  // Debounce for encrypted save
  const encryptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When selectedDoc changes: determine if we need to prompt for a password
  useEffect(() => {
    // Clear unlocked state when switching docs
    if (selectedDoc?.id !== unlockedDocIdRef.current) {
      unlockedDocIdRef.current = null
      setUnlockedPassword(null)
      setDecryptedContent('')
    }

    if (!selectedDoc) {
      setPasswordPrompt(null)
      return
    }

    if (selectedDoc.isEncrypted && !unlockedPassword) {
      setPasswordPrompt('unlock')
      setMode('preview')
    } else {
      setPasswordPrompt(null)
    }
  }, [selectedDoc, unlockedPassword])

  // Cleanup encrypt-save timer on unmount / doc change
  useEffect(() => {
    return () => {
      if (encryptSaveTimerRef.current) clearTimeout(encryptSaveTimerRef.current)
    }
  }, [])

  const handleSelect = useCallback(
    async (id: string) => {
      await selectDocument(id)
    },
    [selectDocument]
  )

  const handleCreate = useCallback(
    async (parentId: string | null, title: string) => {
      const doc = await createDocument(parentId, title)
      if (doc) {
        await selectDocument(doc.id)
      }
    },
    [createDocument, selectDocument]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDocument(id)
    },
    [deleteDocument]
  )

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await updateDocument(id, { title })
    },
    [updateDocument]
  )

  const handleTitleChange = useCallback(
    (title: string) => {
      if (selectedId) {
        updateDocument(selectedId, { title })
      }
    },
    [selectedId, updateDocument]
  )

  const handleNewDoc = useCallback(() => {
    handleCreate(null, 'Untitled')
  }, [handleCreate])

  const handleNewSubDoc = useCallback(() => {
    if (selectedId) {
      handleCreate(selectedId, 'Untitled')
    }
  }, [selectedId, handleCreate])

  const handleToggleLock = useCallback(() => {
    if (selectedDoc) {
      const newLocked = !selectedDoc.isLocked
      setLocked(selectedDoc.id, newLocked)
      if (newLocked) {
        setMode('preview')
      }
    }
  }, [selectedDoc, setLocked])

  const handleToggleEncrypt = useCallback(async () => {
    if (!selectedDoc) return

    if (selectedDoc.isEncrypted) {
      // Disabling encryption — must have unlocked first
      if (!unlockedPassword) {
        setPasswordPrompt('unlock')
        return
      }
      // Write the decrypted content back in plaintext, then clear the flag
      await updateDocument(selectedDoc.id, { content: decryptedContent })
      await setEncrypted(selectedDoc.id, false)
      setUnlockedPassword(null)
      unlockedDocIdRef.current = null
    } else {
      // Enabling encryption — prompt for a new password
      setPasswordError(null)
      setPasswordPrompt('setup')
    }
  }, [selectedDoc, unlockedPassword, decryptedContent, updateDocument, setEncrypted])

  const handlePasswordSubmit = useCallback(
    async (password: string) => {
      if (!selectedDoc) return
      setPasswordError(null)

      if (passwordPrompt === 'setup') {
        // Enabling encryption on a plaintext document
        try {
          const hash = await hashPassword(password)
          const encrypted = await encryptWithPassword(content, password)
          // Save encrypted content first, then flip the encrypted flag with hash
          await updateDocument(selectedDoc.id, { content: encrypted })
          await setEncrypted(selectedDoc.id, true, hash)
          setUnlockedPassword(password)
          setDecryptedContent(content)
          unlockedDocIdRef.current = selectedDoc.id
          setPasswordPrompt(null)
        } catch {
          setPasswordError('Failed to encrypt document')
        }
        return
      }

      if (passwordPrompt === 'unlock') {
        // Verify password against stored hash
        if (!passwordHash) {
          setPasswordError('No password hash stored')
          return
        }
        try {
          const ok = await verifyPassword(password, passwordHash)
          if (!ok) {
            setPasswordError('Incorrect password')
            return
          }
          // Decrypt the stored ciphertext
          const plaintext = await decryptWithPassword(content, password)
          setUnlockedPassword(password)
          setDecryptedContent(plaintext)
          unlockedDocIdRef.current = selectedDoc.id
          setPasswordPrompt(null)
        } catch {
          setPasswordError('Failed to decrypt — possibly corrupted')
        }
      }
    },
    [passwordPrompt, selectedDoc, content, passwordHash, updateDocument, setEncrypted]
  )

  const handlePasswordCancel = useCallback(() => {
    setPasswordPrompt(null)
    setPasswordError(null)
    if (selectedDoc?.isEncrypted && !unlockedPassword) {
      // User cancelled unlocking an encrypted doc — deselect it
      selectDocument(null)
    }
  }, [selectedDoc, unlockedPassword, selectDocument])

  // Plain-content change (non-encrypted doc)
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (selectedId) {
        saveContent(selectedId, e.target.value)
      }
    },
    [selectedId, saveContent]
  )

  // Encrypted-content change: re-encrypt and save debounced
  const handleEncryptedContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setDecryptedContent(newValue)
      if (!selectedId || !unlockedPassword) return
      if (encryptSaveTimerRef.current) clearTimeout(encryptSaveTimerRef.current)
      encryptSaveTimerRef.current = setTimeout(async () => {
        try {
          const encrypted = await encryptWithPassword(newValue, unlockedPassword)
          await saveEncryptedContent(selectedId, encrypted)
        } catch (err) {
          console.error('Failed to save encrypted content:', err)
        }
      }, 1000)
    },
    [selectedId, unlockedPassword, saveEncryptedContent]
  )

  const handleModeChange = useCallback(
    (newMode: 'edit' | 'preview') => {
      if (selectedDoc?.isLocked && newMode === 'edit') return
      setMode(newMode)
    },
    [selectedDoc]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-950">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    )
  }

  // Determine the content to display in the editor
  const isDocEncrypted = selectedDoc?.isEncrypted ?? false
  const editorContent = isDocEncrypted ? decryptedContent : content
  const editorReadOnly = selectedDoc?.isLocked || (isDocEncrypted && !unlockedPassword)
  const editorOnChange = isDocEncrypted ? handleEncryptedContentChange : handleContentChange

  return (
    <div className="flex h-full flex-col bg-surface-950">
      {/* Toolbar */}
      <EditorToolbar
        selectedDoc={selectedDoc}
        mode={mode}
        onModeChange={handleModeChange}
        onToggleLock={handleToggleLock}
        onToggleEncrypt={handleToggleEncrypt}
        onTitleChange={handleTitleChange}
        onNewDoc={handleNewDoc}
        onNewSubDoc={handleNewSubDoc}
      />

      {/* Main content: sidebar + editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document tree sidebar */}
        <DocumentTree
          documents={documents}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
          onRename={handleRename}
        />

        {/* Editor / preview area */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-surface-800">
          {!selectedDoc ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
              <FileText className="mb-4 h-12 w-12 text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-300">Notebook</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select a document or create a new one to get started
              </p>
            </div>
          ) : contentLoading ? (
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
            </div>
          ) : mode === 'edit' ? (
            <textarea
              value={editorContent}
              onChange={editorOnChange}
              readOnly={editorReadOnly}
              placeholder={
                isDocEncrypted && !unlockedPassword
                  ? 'Document is encrypted — unlock to view'
                  : 'Start writing...'
              }
              className="h-full w-full resize-none bg-surface-800 px-8 py-6 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
              spellCheck={false}
            />
          ) : (
            <MarkdownPreview content={editorContent} />
          )}

          {/* Password prompt overlay */}
          {passwordPrompt && (
            <PasswordPrompt
              purpose={passwordPrompt}
              error={passwordError}
              onSubmit={handlePasswordSubmit}
              onCancel={handlePasswordCancel}
            />
          )}
        </div>
      </div>
    </div>
  )
}
