import { get, set } from 'idb-keyval'
import { join } from 'path-browserify'

export async function readBlobAsUint8Array(file: Blob) {
  const fileReader = new FileReader()
  fileReader.readAsArrayBuffer(file)
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    fileReader.addEventListener('load', () => {
      resolve(new Uint8Array(fileReader.result as ArrayBuffer))
    })
  })
}

export async function detectLocalHandleExistence(name: string) {
  const handles = (await get('local-file-system-handles')) ?? {}
  const handle = handles[name]
  return Boolean(handle)
}

export async function detectLocalHandlePermission({ name, mode }: { name: string; mode: string }) {
  const handles = await get('local-file-system-handles')
  const permission = await handles?.[name]?.queryPermission({ mode })
  return permission === 'granted'
}

export async function requestLocalHandle({ name, mode }: { name: string; mode: string }) {
  const handles = (await get('local-file-system-handles')) ?? {}

  const handle = handles[name]
  if (handle) {
    const permission = await handle.requestPermission({ mode })
    if (permission === 'granted') {
      return handle
    }
    throw new Error('The user abort a request.')
  } else {
    return await requestFreshLocalHandle({ name, mode })
  }
}

export async function requestFreshLocalHandle({ name, mode }: { name: string; mode: string }) {
  const handle = await window.showDirectoryPicker({ mode })
  const handles = (await get('local-file-system-handles')) ?? {}
  handles[name] = handle
  await set('local-file-system-handles', handles)
  return handle
}

async function getFilePromise({ entry, handle, path }) {
  const file = await entry.getFile()
  file.directoryHandle = handle
  file.handle = entry
  return Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    enumerable: true,
    get: () => path,
  })
}

export async function listDirectoryByHandle({ handle, path }: { handle: FileSystemDirectoryHandle; path?: string }) {
  const entries: FileSystemHandle[] = []
  for await (const entry of handle.values()) {
    entries.push(entry)
  }
  return entries
}

export async function listFilesRecursivelyByHandle({
  handle,
  path = handle.name,
}: {
  handle: FileSystemHandle
  path?: string
}) {
  const directoryPromises: Promise<File[]>[] = []
  const filePromises: Promise<File>[] = []
  for await (const entry of handle.values()) {
    const nestedPath = join(path, entry.name)
    if (entry.kind === 'file') {
      const filePromise = getFilePromise({ entry, handle, path: nestedPath })
      filePromises.push(filePromise)
    } else if (entry.kind === 'directory') {
      const directoryPromise = listFilesRecursivelyByHandle({ handle: entry, path: nestedPath })
      directoryPromises.push(directoryPromise)
    }
  }
  const directory = await Promise.all(directoryPromises)
  const directryFiles = directory.flat()
  const files = await Promise.all(filePromises)
  return [...directryFiles, ...files]
}
