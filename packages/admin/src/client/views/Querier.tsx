import React from 'react'
import {useLocalStorage, useMeasure} from 'react-use'
import {z} from 'zod'
import {ResultsViewer} from '../results/grid'
import {useSettings} from '../settings'
import {SqlCodeMirror} from '../sql-codemirror'
import {FakeProgress} from '../utils/fake-progress'
import {trpc} from '../utils/trpc'
import {Button} from '@/components/ui/button'
import {icons} from '@/components/ui/icons'

const noErrors = [] as []

const PGErrorLike = z.object({
  code: z.string(),
  position: z.string(),
})
const PGErrorWrapper = z.object({
  error: PGErrorLike,
})

export const Querier = () => {
  const [ref, mes] = useMeasure<HTMLDivElement>()
  const [storedCode = '', setStoredCode] = useLocalStorage(`sql-editor-code:0.0.1`, `show search_path`)
  const [wrapText, setWrapText] = useLocalStorage(`sql-editor-wrap-text:0.0.1`, true)
  const fileMutation = trpc.csv.useMutation()
  const settings = useSettings()
  const execute = trpc.executeSql.useMutation({
    onSuccess: data => {
      const newErrors = data.results.flatMap(r => {
        if (r.error && typeof r.position === 'number') {
          return [{message: r.error.message, position: r.position + 1}]
        }

        const parsed = PGErrorWrapper.safeParse(r.error?.cause)
        if (parsed.success) {
          const pgError = parsed.data.error
          return [{message: r.error?.message || pgError.code, position: Number(pgError.position) - 1}]
        }

        return []
      })
      setErrors(newErrors.length > 0 ? newErrors : noErrors)
    },
  })
  const aiMutation = trpc.aiQuery.useMutation({
    onSuccess: (data, variables) => {
      setStoredCode(
        [
          `-- Prompt: ${variables.prompt}`,
          data.query, //
        ].join('\n\n'),
      )
    },
  })

  const [errorMap, setErrorMap] = React.useState(
    {} as Record<string, {time: number; errs: Array<{position: number; message: string}>}>,
  )

  const errors = React.useMemo(() => errorMap[storedCode]?.errs || [], [errorMap, storedCode])
  const setErrors = React.useCallback(
    (errs: (typeof errorMap)[string]['errs']) => {
      const entries = Object.entries(errorMap)
        .concat([[storedCode, {time: Date.now(), errs}]])
        .slice(-100) // don't hang on to the past
      setErrorMap(Object.fromEntries(entries))
    },
    [errorMap, storedCode],
  )

  return (
    <div className="p-4 dark:bg-gray-900 h-full relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">SQL Editor</h3>
        <div className="flex gap-1">
          <Button
            title="AI"
            disabled={aiMutation.isLoading}
            onClick={() => {
              const aiPrompt = prompt('Enter a prompt', aiMutation.variables?.prompt || '')
              if (!aiPrompt) return
              aiMutation.mutate({
                prompt: aiPrompt,
                includeSchemas: settings.includeSchemas,
                excludeSchemas: settings.excludeSchemas,
              })
            }}
          >
            🧙‍♂️
          </Button>
          <Button title="Run" onClick={() => execute.mutate({query: storedCode})}>
            <icons.Play />
          </Button>
        </div>
      </div>
      {aiMutation.isLoading && <FakeProgress value={aiMutation.isSuccess ? 100 : null} estimate={3000} />}
      <div className="flex flex-col gap-4 h-[90%] relative">
        <div ref={ref} className="h-1/2 border rounded-lg overflow-scroll relative bg-gray-800">
          <SqlCodeMirror
            height={mes.height + 'px'}
            code={storedCode}
            errors={errors}
            onChange={setStoredCode}
            onExecute={query => execute.mutate({query})}
            wrapText={wrapText}
          />
          <div className="absolute bottom-2 right-2 flex gap-1">
            <Button onClick={() => setWrapText(old => !old)} className="text-gray-100" size="sm">
              <icons.RemoveFormatting className="w-4 h-4 text-gray-100" />
            </Button>
            <Button
              className="text-gray-100"
              size="sm"
              onClick={async () => {
                const {csv} = await fileMutation.mutateAsync({query: storedCode})
                const blob = new Blob([csv], {type: 'text/csv'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                // a.download = `query.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <icons.Download className="w-4 h-4 text-gray-100" />
            </Button>
          </div>
        </div>
        <div className="h-1/2 border rounded-lg overflow-scroll bg-gray-800 text-gray-100">
          <div className="resultsContainer">
            {execute.data?.results.map((r, i, {length}) => {
              return (
                <details key={`${i}_${r.query}`} open={i === length - 1 || Boolean(r.error)}>
                  <summary>Query {r.query}</summary>
                  {r.error ? (
                    <pre
                      style={{
                        width: '100%',
                        maxWidth: '80vw',
                        overflowX: 'scroll',
                        textWrap: wrapText ? 'wrap' : 'nowrap',
                      }}
                    >
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
            <span title="Squirrel" data-title-es="Ardilla" className="p-2">
              🐿️
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
