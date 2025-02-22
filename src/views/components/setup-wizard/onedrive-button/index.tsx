import { useAtomValue, useSetAtom } from 'jotai'
import { useAsyncFn } from 'react-use'
import { updatePreference, validateRomDirectory } from '../../../../core'
import { BaseButton } from '../../primitives/base-button'
import { BaseDialogTrigger } from '../../primitives/base-dialog-trigger'
import { isInvalidDialogOpenAtom, onSetupAtom } from '../atoms'
import { OnedriveDirectoryPicker } from './onedrive-directory-picker'

export function OnedriveButton() {
  const onSetup = useAtomValue(onSetupAtom)
  const setIsInvalidDialogOpen = useSetAtom(isInvalidDialogOpenAtom)

  const [state, onSelect] = useAsyncFn(
    async (romDirectory: string) => {
      const isValid = await validateRomDirectory({ directory: romDirectory, type: 'onedrive' })

      if (isValid) {
        await updatePreference({ fileSystem: 'onedrive', directory: romDirectory })
        onSetup?.()
        setIsInvalidDialogOpen(false)
      } else {
        setIsInvalidDialogOpen(true)
      }
    },
    [onSetup]
  )

  return (
    <BaseDialogTrigger
      content={
        <div className='w-96 max-w-full'>
          <OnedriveDirectoryPicker isValidating={state.loading} onSelect={onSelect} />
        </div>
      }
    >
      <BaseButton className='w-60' styleType='primary'>
        <span className='icon-[logos--microsoft-onedrive] h-5 w-5' />
        OneDrive
      </BaseButton>
    </BaseDialogTrigger>
  )
}
