import { useState, useCallback, useRef, useEffect } from 'react'
import { PendingSave } from '../utils/pendingSave'

export interface DocumentMeta {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
  isLocked: boolean
  isEncrypted: boolean
  createdAt: number
  updatedAt: number
}

export interface DocumentContent {
  content: string
  isEncrypted: boolean
  passwordHash: string | null
}

export function useNotebook() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [passwordHash, setPasswordHash] = useState<string | null>(null)

  const pendingSave = useRef(new PendingSave())
  const selectionRequest = useRef(0)

  const refreshTree = useCallback(async () => {
    try {
      const tree: DocumentMeta[] = await window.api.invoke('notebook:get-tree')
      setDocuments(tree)
    } catch (err) {
      console.error('Failed to load notebook tree:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshTree()
  }, [refreshTree])

  const selectDocument = useCallback(async (id: string | null) => {
    const request = ++selectionRequest.current
    await pendingSave.current.flush()
    if (request !== selectionRequest.current) return

    setSelectedId(id)

    if (!id) {
      setContent('')
      setIsEncrypted(false)
      setPasswordHash(null)
      setContentLoading(false)
      return
    }

    setContentLoading(true)
    try {
      const result: DocumentContent | null = await window.api.invoke('notebook:get-content', id)
      if (request !== selectionRequest.current) return
      if (!result) throw new Error('Document no longer exists')
      setContent(result.content)
      setIsEncrypted(result.isEncrypted)
      setPasswordHash(result.passwordHash)
    } catch (err) {
      console.error('Failed to load document content:', err)
      if (request === selectionRequest.current) setContent('')
    } finally {
      if (request === selectionRequest.current) setContentLoading(false)
    }
  }, [])

  const createDocument = useCallback(
    async (parentId: string | null, title: string) => {
      try {
        const doc: DocumentMeta = await window.api.invoke('notebook:create', parentId, title)
        await refreshTree()
        return doc
      } catch (err) {
        console.error('Failed to create document:', err)
        return null
      }
    },
    [refreshTree]
  )

  const updateDocument = useCallback(
    async (id: string, updates: Partial<Pick<DocumentMeta, 'title' | 'sortOrder' | 'isLocked' | 'isEncrypted'>> & { content?: string; passwordHash?: string | null }) => {
      try {
        await pendingSave.current.flush()
        const doc: DocumentMeta = await window.api.invoke('notebook:update', id, updates)
        if (id === selectedId && updates.content !== undefined) setContent(updates.content)
        await refreshTree()
        return doc
      } catch (err) {
        console.error('Failed to update document:', err)
        return null
      }
    },
    [refreshTree, selectedId]
  )

  const saveContent = useCallback(
    (id: string, newContent: string) => {
      setContent(newContent)

      pendingSave.current.schedule(async () => {
        await window.api.invoke('notebook:update-content', id, newContent)
      })
    },
    []
  )

  const deleteDocument = useCallback(
    async (id: string) => {
      try {
        await window.api.invoke('notebook:delete', id)
        if (id === selectedId) {
          setSelectedId(null)
          setContent('')
          setIsEncrypted(false)
          setPasswordHash(null)
        }
        await refreshTree()
      } catch (err) {
        console.error('Failed to delete document:', err)
      }
    },
    [refreshTree, selectedId]
  )

  const setLocked = useCallback(
    async (id: string, locked: boolean) => {
      try {
        await window.api.invoke('notebook:set-locked', id, locked)
        await refreshTree()
      } catch (err) {
        console.error('Failed to toggle lock:', err)
      }
    },
    [refreshTree]
  )

  const setEncrypted = useCallback(
    async (id: string, encrypted: boolean, hash?: string) => {
      try {
        await window.api.invoke('notebook:set-encrypted', id, encrypted, hash)
        setIsEncrypted(encrypted)
        setPasswordHash(hash ?? null)
        await refreshTree()
      } catch (err) {
        console.error('Failed to toggle encryption:', err)
      }
    },
    [refreshTree]
  )

  const saveEncryptedContent = useCallback(async (id: string, encryptedContent: string) => {
    await window.api.invoke('notebook:save-encrypted-content', id, encryptedContent)
  }, [])

  // Persist pending edits when navigating to another tool.
  useEffect(() => {
    const saves = pendingSave.current
    return () => {
      selectionRequest.current++
      void saves.flush().catch((error) => console.error('Failed to save document:', error))
    }
  }, [])

  const selectedDoc = documents.find((d) => d.id === selectedId) ?? null

  return {
    documents,
    selectedId,
    selectedDoc,
    content,
    loading,
    contentLoading,
    isEncrypted,
    passwordHash,
    refreshTree,
    selectDocument,
    createDocument,
    updateDocument,
    saveContent,
    deleteDocument,
    setLocked,
    setEncrypted,
    saveEncryptedContent
  }
}
