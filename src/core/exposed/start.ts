import { GoogleDriveProvider } from '../classes/file-system-providers/google-drive-provider'
import { LocalProvider } from '../classes/file-system-providers/local-provider'
import { OnedriveProvider } from '../classes/file-system-providers/onedrive-provider'
import { PreferenceParser } from '../classes/preference-parser'
import { globalContext } from '../internal/global-context'

export async function start() {
  const type = PreferenceParser.get('romProviderType')
  switch (type) {
    case 'local':
      globalContext.fileSystem = await LocalProvider.getSingleton()
      break
    case 'onedrive':
      globalContext.fileSystem = await OnedriveProvider.getSingleton()
      break
    case 'google-drive':
      globalContext.fileSystem = await GoogleDriveProvider.getSingleton()
      break
    default:
      throw new Error('unknown rom provider type')
  }
}
