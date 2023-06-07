import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect } from 'react'
import { ui } from '../../../../core'
import { currentSystemNameAtom, systemsAtom } from '../atoms'
import { SystemNavigationItem } from './system-navigation-item'

const lastSelectedSystemStorageKey = 'last-selected-system'
export function SystemNavigation() {
  const systems = useAtomValue(systemsAtom)
  const [currentSystemName, setCurrentSystemName] = useAtom(currentSystemNameAtom)
  const isValidSystems = systems?.length && systems.length > 0

  const selectPrevSystem = useCallback(() => {
    if (isValidSystems) {
      const index = systems.findIndex((system) => system.name === currentSystemName)
      if (index > 0) {
        setCurrentSystemName(systems[index - 1].name)
      } else {
        setCurrentSystemName(systems.at(-1)?.name || '')
      }
    }
  }, [isValidSystems, currentSystemName, setCurrentSystemName, systems])

  const selectNextSystem = useCallback(() => {
    if (isValidSystems) {
      const index = systems.findIndex((system) => system.name === currentSystemName)
      if (index < systems.length - 1) {
        setCurrentSystemName(systems[index + 1].name)
      } else {
        setCurrentSystemName(systems[0].name)
      }
    }
  }, [isValidSystems, currentSystemName, setCurrentSystemName, systems])

  useEffect(() => {
    if (currentSystemName) {
      localStorage.setItem(lastSelectedSystemStorageKey, currentSystemName)
    }
  }, [currentSystemName])

  useEffect(() => {
    ui.onPressButton('l1', selectPrevSystem)
    return () => {
      ui.offPressButton('l1', selectPrevSystem)
    }
  }, [selectPrevSystem])

  useEffect(() => {
    ui.onPressButton('r1', selectNextSystem)
    return () => {
      ui.offPressButton('r1', selectNextSystem)
    }
  }, [selectNextSystem])

  return (
    <div className='flex flex-1 flex-nowrap overflow-x-auto overflow-y-hidden'>
      {systems?.map((system) => (
        <SystemNavigationItem key={system.name} system={system} />
      ))}
    </div>
  )
}