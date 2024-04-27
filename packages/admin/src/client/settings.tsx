/* eslint-disable no-alert */
import React from 'react'
import {useLocalStorage} from 'react-use'
import {z} from 'zod'
import {createCascadingState} from './utils/cascading-state'
import {ZForm} from './utils/zform/form'

export const Settings = z.object({
  apiUrl: z.string(),
  includeSchemas: z.string().optional(),
  excludeSchemas: z.string().optional(),
  headers: z.record(z.string()).optional(),
})

export type Settings = z.infer<typeof Settings>

export const settingsContext = createCascadingState<Settings>({apiUrl: ''}, defaultValue =>
  useLocalStorage('settings.0.0.2', defaultValue),
)

export const useSettings = () => {
  const [value, update] = settingsContext.useState()

  return {...value, update}
}

export const SettingsPanel = () => {
  const {update, ...value} = useSettings()

  return (
    <ZForm
      useFormProps={{defaultValues: value}}
      className="gap-5"
      schema={Settings}
      onSubmit={() => {}}
      submitButton={<></>}
      onTouch={update}
    />
  )
}
