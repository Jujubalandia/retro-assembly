import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { onSetupAtom } from './atoms'
import { GetStarted } from './get-started'
import { Header } from './header'

const backgroundImage =
  'repeating-linear-gradient(45deg, #fafafa 25%, transparent 25%, transparent 75%, #fafafa 75%, #fafafa), repeating-linear-gradient(45deg, #fafafa 25%, white 25%, white 75%, #fafafa 75%, #fafafa)'
export default function SetupWizard({ onSetup }: { onSetup: () => void }) {
  const setOnSetup = useSetAtom(onSetupAtom)

  useEffect(() => {
    setOnSetup(() => onSetup)
  }, [onSetup, setOnSetup])

  return (
    <div className='min-h-screen bg-white  bg-[length:30px_30px] bg-[0_0,15px_15px]' style={{ backgroundImage }}>
      <div className='hero relative h-[600px] max-h-[50vh] min-h-[450px]'>
        <div className='absolute right-5 top-5 z-[2] flex items-center gap-4 text-sm text-white'>
          <a
            className='flex items-center justify-center gap-1'
            href='https://github.com/arianrhodsandlot/retro-assembly'
            rel='noreferrer'
            target='_blank'
          >
            <span className='icon-[simple-icons--github] mr-1 h-5 w-5' />
            GitHub
          </a>
        </div>

        <div className='relative z-[1] flex h-full flex-col'>
          <div className='flex-1' />
          <Header />
        </div>
      </div>

      <div className='mt-10'>
        <GetStarted />
      </div>

      <div className='mt-10 py-4 text-center text-xs text-rose-700'>
        <div className='flex items-center justify-center'>
          <div>
            © <a href='https://github.com/arianrhodsandlot/'> arianrhodsandlot</a> 2023
          </div>
        </div>
      </div>
    </div>
  )
}
