import React from 'react'
import * as jsonView from 'react-json-view-lite'
import {useLocalStorage} from 'react-use'
import {PostgreSQLJson} from '../packlets/autocomplete/suggest'
import styles from './Sqler.module.scss'
import logo from './images/pgkit_transparent_cropped.png'
import {ResultsViewer} from './results/grid'
import {Settings, useSettings} from './settings'
import {SqlCodeMirror} from './sql-codemirror'
import {Tables} from './tables/Tables'
import {trpc} from './trpc'

import 'react-json-view-lite/dist/index.css'

const noErrors = [] as []

export function Sqler() {
  const mut = trpc.executeSql.useMutation({
    onSuccess: data => {
      const newErrors = data.results.flatMap(r =>
        r.error && typeof r.position === 'number' ? [{message: r.error.message, position: r.position + 1}] : [],
      )
      setErrors(newErrors.length > 0 ? newErrors : noErrors)
    },
  })
  const aiMut = trpc.aiQuery.useMutation({
    onSuccess: (data, variables) => {
      setStoredCode(
        [
          `-- Prompt: ${variables.prompt}`,
          data.query, //
        ].join('\n\n'),
      )
    },
  })
  const settings = useSettings()
  const inspectQuery = trpc.inspect.useQuery({
    includeSchemas: settings.includeSchemas,
    excludeSchemas: settings.excludeSchemas,
  })
  const inspected = (inspectQuery.data?.inspected || {}) as {} as PostgreSQLJson

  const [storedCode = '', setStoredCode] = useLocalStorage(`sql-editor-code:0.0.1`, `show search_path`)
  const [errorMap, setErrorMap] = React.useState({} as Record<string, Array<{position: number; message: string}>>)

  const errors = React.useMemo(() => errorMap[storedCode] || [], [errorMap, storedCode])
  const setErrors = React.useCallback(
    (errs: (typeof errorMap)[string]) => setErrorMap({...errorMap, [storedCode]: errs}),
    [errorMap, storedCode],
  )
  return (
    <section data-layout={settings.layout}>
      <nav className={styles.navBar}>
        <div style={{display: 'flex', flexDirection: 'row'}}>
          <Settings />
          <img src={logo} alt="pgkit" height={50} />
        </div>
        <div style={{display: 'flex', gap: 5}}>
          <button
            aria-label="AI query"
            className={styles.runButton}
            disabled={aiMut.isLoading}
            onClick={() => {
              const aiPrompt = prompt('Enter a prompt', aiMut.variables?.prompt || '')
              if (!aiPrompt) return
              aiMut.mutate({
                prompt: aiPrompt,
                includeSchemas: settings.includeSchemas,
                excludeSchemas: settings.excludeSchemas,
              })
            }}
          >
            🧙‍♂️
          </button>
          <button aria-label="Run button" className={styles.runButton} onClick={() => mut.mutate({query: storedCode})}>
            ▶️
          </button>
        </div>
      </nav>
      <div className={styles.querierPanel}>
        <div className={styles.sqlerContainer}>
          <div className={styles.editorContainer} style={{position: 'relative'}}>
            {settings.view === 'sql' && (
              <SqlCodeMirror
                code={storedCode}
                onChange={query => setStoredCode(query)}
                onExecute={query => mut.mutate({query})}
                inspected={inspected}
                searchPath={inspectQuery.data?.searchPath}
                errors={errors}
              />
            )}
            {settings.view === 'tables' && inspected && <Tables inspected={inspected} />}
            {settings.view === 'inspect' && (
              <div className={styles.jsonView}>
                <jsonView.JsonView
                  data={inspected}
                  shouldExpandNode={jsonView.collapseAllNested}
                  style={jsonView.darkStyles}
                />
              </div>
            )}
          </div>
        </div>
        <div className={styles.resultsContainer}>
          {mut.data?.results.map((r, i, {length}) => {
            return (
              <details key={`${i}_${r.query}`} open={i === length - 1 || Boolean(r.error)}>
                <summary>Query {r.query}</summary>
                {r.error ? (
                  <pre style={{width: '100%', textWrap: 'wrap'}}>
                    Error:{'\n'}
                    {JSON.stringify(r, null, 2)}
                  </pre>
                ) : (
                  <>
                    <ResultsViewer values={r.result || []} />
                    <blockquote>
                      <details>
                        <summary>Statement</summary>
                        <pre>{r.original}</pre>
                      </details>
                    </blockquote>
                  </>
                )}
              </details>
            )
          })}
          <span className={styles.endMarker}>🐿️</span>
        </div>
      </div>
    </section>
  )
}
