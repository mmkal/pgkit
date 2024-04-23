/* eslint-disable no-alert */
import React from 'react'
import {Popover} from 'react-tiny-popover'
import {useLocalStorage} from 'react-use'

const useSettingsProps = () => {
  const [apiUrl, setApiUrl] = useLocalStorage('apiUrl.0.0.1', '')
  const [includeSchemas, setIncludeSchemas] = useLocalStorage('includeSchemas.0.0.1', '')
  const [excludeSchemas, setExcludeSchemas] = useLocalStorage('excludeSchemas.0.0.1', '')
  const [view, setView] = useLocalStorage('view.0.0.1', 'sql' as 'sql' | 'tables' | 'inspect')
  const [headers, setHeaders] = useLocalStorage('headers.0.0.1', {
    'connection-string': 'postgres://postgres:postgres@localhost:5432/postgres',
  } as Record<string, string>)
  const [layout, setLayout] = useLocalStorage('sqler-layout.0.0.1', 'horizontal' as 'horizontal' | 'vertical')

  const setHeader = React.useCallback(
    (key: string, value: string) => {
      if (!key) return
      setHeaders({...headers, [key]: value})
    },
    [headers, setHeaders],
  )

  return {
    apiUrl: apiUrl || '',
    setApiUrl,
    includeSchemas: includeSchemas || '',
    setIncludeSchemas,
    excludeSchemas: excludeSchemas || '',
    setExcludeSchemas,
    headers: headers || {},
    layout,
    setHeader,
    setHeaders,
    setLayout,
    view,
    setView,
  }
}

export type SettingsProps = ReturnType<typeof useSettingsProps>

export const SettingsContext = React.createContext<SettingsProps | null>(null)

export const SettingsProvider = ({children}: {children: React.ReactNode}) => {
  const settings = useSettingsProps()
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export const withSettings = <P extends object>(Component: React.ComponentType<P>) => {
  function ComponentWithSettings(props: P) {
    return (
      <SettingsProvider>
        <Component {...props} />
      </SettingsProvider>
    )
  }

  return ComponentWithSettings
}

export const useSettings = () => {
  const settings = React.useContext(SettingsContext)
  if (!settings) {
    throw new Error('useSettings must be used within SettingsProvider')
  }

  return settings
}

export const Settings = () => {
  const [openSettings, setOpenSettings] = React.useState(false)
  return (
    <Popover
      isOpen={openSettings}
      containerStyle={{zIndex: '2'}}
      onClickOutside={() => setOpenSettings(false)}
      content={<SettingsPanel />}
    >
      <button role="menu" aria-label="hamburger menu" onClick={() => setOpenSettings(!openSettings)}>
        🍔
      </button>
    </Popover>
  )
}

const SettingsPanel = () => {
  const settings = useSettings()
  return (
    <div style={{background: 'black', border: '2px solid white', padding: 10}}>
      <h1>Settings</h1>
      <section>
        <button
          onClick={() => {
            settings.setLayout(settings.layout === 'horizontal' ? 'vertical' : 'horizontal')
          }}
        >
          🚦/🚥
        </button>
      </section>
      <div data-setting="view">
        <h2>View</h2>
        <select onChange={ev => settings.setView(ev.target.value as typeof settings.view)}>
          <option value="sql">SQL</option>
          <option value="tables">Tables</option>
          <option value="schema">Inspect</option>
        </select>
      </div>
      <div data-setting="api-url">
        <h2>API URL</h2>
        <input
          onBlur={ev => settings.setApiUrl(ev.target.value)}
          defaultValue={settings.apiUrl}
          style={{width: 'calc(100% - 20px)'}}
        />
      </div>
      <div>
        <h3>Include Schemas</h3>
        <input
          onBlur={ev => settings.setIncludeSchemas(ev.target.value)}
          defaultValue={settings.includeSchemas}
          style={{width: 'calc(100% - 20px)'}}
        />
      </div>
      <div>
        <h3>Exclude Schemas</h3>
        <input
          onBlur={ev => settings.setExcludeSchemas(ev.target.value)}
          defaultValue={settings.excludeSchemas}
          style={{width: 'calc(100% - 20px)'}}
        />
      </div>
      <div>
        <h2>Headers</h2>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(settings.headers).map(([key, value]) => (
              <tr data-header={key} key={key}>
                <td>{key}</td>
                <td>
                  <input
                    style={{width: `${Math.max(value.length, 10)}ch`}}
                    onBlur={ev => settings.setHeader(key, ev.target.value)}
                    defaultValue={value}
                  />
                </td>
                <td>
                  <button
                    onClick={ev => {
                      const {[key]: _, ...newHeaders} = settings.headers
                      settings.setHeaders(newHeaders)
                      ev.stopPropagation()
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => settings.setHeader(prompt('header name?')!, '')}>Add header</button>
      </div>
    </div>
  )
}
