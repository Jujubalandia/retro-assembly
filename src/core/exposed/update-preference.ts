import { get, set } from 'idb-keyval'
import { isNil } from 'lodash-es'
import { join } from 'path-browserify'
import { PreferenceParser } from '../classes/preference-parser'

function setFileSystemProviderType(type: 'local' | 'onedrive' | 'google-drive') {
  PreferenceParser.set({ name: 'configProviderType', value: type })
  PreferenceParser.set({ name: 'stateProviderType', value: type })
  PreferenceParser.set({ name: 'romProviderType', value: type })
}

function setWorkingDirectory(path: string) {
  PreferenceParser.set({ name: 'romDirectory', value: path })

  const configDirectory = join(path, 'retro-assembly')
  PreferenceParser.set({ name: 'configDirectory', value: configDirectory })

  const statesDirectory = join(configDirectory, 'states')
  PreferenceParser.set({ name: 'stateDirectory', value: statesDirectory })
}

async function setLocalFileSystemHandle(handle) {
  const handles = (await get('local-file-system-handles')) || {}
  handles.rom = handle
  await set('local-file-system-handles', handles)
}

export async function updatePreference({
  fileSystem,
  directory,
  handle,
}: {
  fileSystem?: 'local' | 'onedrive' | 'google-drive'
  directory?: string
  handle?: FileSystemHandle
}) {
  if (!isNil(fileSystem)) {
    setFileSystemProviderType(fileSystem)
  }
  if (!isNil(directory)) {
    setWorkingDirectory(directory)
  }
  if (!isNil(handle)) {
    await setLocalFileSystemHandle(handle)
  }
}
