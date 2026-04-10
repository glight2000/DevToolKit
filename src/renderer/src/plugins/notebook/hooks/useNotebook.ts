import { useState, useCallback, useRef, useEffect } from 'react'

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef('')

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
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    setSelectedId(id)

    if (!id) {
      setContent('')
      setIsEncrypted(false)
      setPasswordHash(null)
      return
    }

    setContentLoading(true)
    try {
      const result: DocumentContent = await window.api.invoke('notebook:get-content', id)
      setContent(result.content)
      setIsEncrypted(result.isEncrypted)
      setPasswordHash(result.passwordHash)
      lastSavedContentRef.current = result.content
    } catch (err) {
      console.error('Failed to load document content:', err)
      setContent('')
    } finally {
      setContentLoading(false)
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
    async (id: string, updates: Partial<DocumentMeta>) => {
      try {
        const doc: DocumentMeta = await window.api.invoke('notebook:update', id, updates)
        await refreshTree()
        return doc
      } catch (err) {
        console.error('Failed to update document:', err)
        return null
      }
    },
    [refreshTree]
  )

  const saveContent = useCallback(
    (id: string, newContent: string) => {
      setContent(newContent)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(async () => {
        if (newContent !== lastSavedContentRef.current) {
          try {
            await window.api.invoke('notebook:update-content', id, newContent)
            lastSavedContentRef.current = newContent
          } catch (err) {
            console.error('Failed to save content:', err)
          }
        }
      }, 1000)
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
    try {
      await window.api.invoke('notebook:save-encrypted-content', id, encryptedContent)
    } catch (err) {
      console.error('Failed to save encrypted content:', err)
    }
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
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
