import { filter } from 'lodash-es'
import { type FileAccessor } from '../classes/file-system-providers/file-accessor'
import { GoogleDriveProvider } from '../classes/file-system-providers/google-drive-provider'
import { LocalProvider } from '../classes/file-system-providers/local-provider'
import { OneDriveProvider } from '../classes/file-system-providers/one-drive-provider'
import { systemNamesSorted } from '../constants/systems'

interface ValidateRomDirectoryParamsForLocalType {
  type: 'local'
  handle: FileSystemDirectoryHandle
}

interface ValidateRomDirectoryParamsForCloudServiceType {
  type: 'onedrive' | 'google-drive'
  directory: string
}

type ValidateRomDirectoryParams = ValidateRomDirectoryParamsForLocalType | ValidateRomDirectoryParamsForCloudServiceType

export async function validateRomDirectory(params: ValidateRomDirectoryParams) {
  const { type } = params
  let directories: FileAccessor[]

  switch (type) {
    case 'onedrive': {
      const { directory } = params
      const onedrive = OneDriveProvider.getSingleton()
      const children = await onedrive.listChildren(directory)
      directories = filter(children, 'isDirectory')
      break
    }
    case 'google-drive': {
      const { directory } = params
      const googleDrive = await GoogleDriveProvider.getSingleton()
      const children = await googleDrive.listChildren(directory)
      directories = filter(children, 'isDirectory')
      break
    }
    case 'local': {
      const { handle } = params
      const local = LocalProvider.getSingleton({ handle })
      const children = await local.listChildren()
      directories = filter(children, 'isDirectory')
      break
    }
    default:
      throw new Error('invalid type:', type)
  }

  return directories.some((directory) => (systemNamesSorted as string[]).includes(directory.name))
}