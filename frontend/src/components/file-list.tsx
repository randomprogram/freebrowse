import React, { useEffect, useMemo, useState } from 'react'
import { Folder, File as FileIcon } from "lucide-react"

export interface FileItem {
  filename: string;
  url: string;
}

interface DirectoryItem {
  name: string;
  path: string;
}

interface DirectoryListingResponse {
  currentPath?: string;
  directories?: DirectoryItem[];
  files?: FileItem[];
}

interface FileListProps {
  endpoint: string;
  onFileSelect: (file: FileItem) => void;
  emptyMessage?: string;
}

export const FileList: React.FC<FileListProps> = ({ 
  endpoint, 
  onFileSelect,
  emptyMessage = "No files available."
}) => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [directories, setDirectories] = useState<DirectoryItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [currentPath, setCurrentPath] = useState<string>('')
  const [resolvedPath, setResolvedPath] = useState<string>('')
  const [initialPathLoaded, setInitialPathLoaded] = useState<boolean>(false)

  const storageKey = useMemo(() => `file-list-path:${endpoint}`, [endpoint])

  // Restore navigation path per endpoint once mounted
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setInitialPathLoaded(false)
    const storedPath = window.localStorage.getItem(storageKey) ?? ''
    setCurrentPath(storedPath)
    setResolvedPath(storedPath)
    setInitialPathLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!initialPathLoaded) {
      return
    }

    let isActive = true
    const controller = new AbortController()

    const fetchFiles = async () => {
      setLoading(true)
      setError('')
      try {
        const url = currentPath
          ? `${endpoint}?path=${encodeURIComponent(currentPath)}`
          : endpoint
        const response = await fetch(url, { signal: controller.signal })
        console.log(`Fetching from ${url}:`, response)
        if (!response.ok) {
          const error = new Error(`HTTP error! Status: ${response.status}`)
          ;(error as any).status = response.status
          throw error
        }
        const data: DirectoryListingResponse | FileItem[] = await response.json()
        console.log(`Files from ${url}:`, data)
        if (!isActive) {
          return
        }
        if (Array.isArray(data)) {
          // Backwards compatibility with pre-directory listing responses
          setDirectories([])
          setFiles(data)
          setResolvedPath(currentPath)
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, currentPath)
          }
        } else {
          setDirectories(data.directories ?? [])
          setFiles(data.files ?? [])
          const nextPath = data.currentPath ?? currentPath
          setResolvedPath(nextPath)
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, nextPath)
          }
        }
      } catch (err: any) {
        if (!isActive || err.name === 'AbortError') {
          return
        }
        console.error(`Error fetching files from ${endpoint}:`, err)
        setError(err.message)
        const status = err?.status
        if (status === 404 && currentPath) {
          setCurrentPath('')
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(storageKey)
          }
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    fetchFiles()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [endpoint, currentPath, storageKey, initialPathLoaded])

  const breadcrumbs = useMemo(() => {
    const parts = resolvedPath ? resolvedPath.split('/').filter(Boolean) : []
    const crumbs = [{ label: 'Root', path: '' }]
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/')
      crumbs.push({ label: part, path })
    })
    return crumbs
  }, [resolvedPath])

  const hasEntries = directories.length > 0 || files.length > 0

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground mb-2">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={`${crumb.label}-${crumb.path || 'root'}`}>
            {index > 0 && <span>/</span>}
            <button
              type="button"
              className="text-blue-600 hover:underline disabled:text-foreground"
              onClick={() => setCurrentPath(crumb.path)}
              disabled={index === breadcrumbs.length - 1}
            >
              {crumb.label || 'Root'}
            </button>
          </React.Fragment>
        ))}
      </div>
      {loading && <p>Loading List...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && (
        hasEntries ? (
          <ul className="space-y-1 text-sm">
            {directories.map((dir) => (
              <li
                key={`dir-${dir.path}`}
                className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted"
                onClick={() => setCurrentPath(dir.path)}
              >
                <Folder className="h-4 w-4" />
                <span className="font-medium">{dir.name}</span>
              </li>
            ))}
            {files.map((file, index) => {
              const displayName = file.filename.split('/').pop() ?? file.filename
              return (
                <li
                  key={`file-${file.filename}-${index}`}
                  className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted"
                  onClick={() => onFileSelect(file)}
                >
                  <FileIcon className="h-4 w-4" />
                  <span>{displayName}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p>{emptyMessage}</p>
        )
      )}
    </div>
  )
}

export default FileList
