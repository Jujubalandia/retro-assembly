import '../styles/index.sass'
import { useAtom } from 'jotai'
import { useEffect } from 'react'
import { system } from '../../core'
import { needsGrantLocalPermissionAtom, needsSetupAtom } from '../lib/atoms'
import { HomeScreen } from './home-screen'
import LocalPermission from './modals/local-permission'
import { Settings } from './modals/settings'
import SetupWizard from './modals/setup-wizard'

export default function App() {
  const [, setNeedsSetup] = useAtom(needsSetupAtom)
  const [, setNeedsGrantLocalPermissionAtom] = useAtom(needsGrantLocalPermissionAtom)

  async function checkPreparations() {
    const needsSetup = await system.checkNeedsSetup()
    setNeedsSetup(needsSetup)

    if (!needsSetup) {
      const needsGrantPermission = await system.needsGrantPermissionManually()
      setNeedsGrantLocalPermissionAtom(needsGrantPermission)
      if (!needsGrantPermission) {
        await system.start()
      }
    }
  }

  useEffect(() => {
    checkPreparations()
  }, [])

  return (
    <>
      <HomeScreen />
      <SetupWizard onSubmit={checkPreparations} />
      <LocalPermission onSubmit={checkPreparations} />
      <Settings />
    </>
  )
}
