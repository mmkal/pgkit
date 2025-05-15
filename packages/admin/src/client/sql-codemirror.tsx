import {type CompletionSource, acceptCompletion, autocompletion} from '@codemirror/autocomplete'
import {sql} from '@codemirror/lang-sql'
import {linter, lintGutter} from '@codemirror/lint'
import {EditorState, Extension, Prec} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import clsx from 'clsx'
import React from 'react'
import {useMeasure} from 'react-use'
import {SuggestionType, getSuggester} from '../packlets/autocomplete/suggest'
import {useInspected, useSearchPath} from './utils/inspect'

export interface SqlCodeMirrorProps {
  code?: string
  onChange?: (query: string) => void
  onExecute?: (sql: string) => void
  errors?: Array<{position: number; message: string | string[]}>
  height: string
  readonly?: boolean
  wrapText?: boolean
}

type MeasuredCodeMirrorProps = Omit<SqlCodeMirrorProps, 'height'> & {
  /** Use this to control the height of the codemirror container. The code editor will be dynamically adjusted to match the container's full height. @default h-full */
  className?: string
}

export const MeasuredCodeMirror = (props: MeasuredCodeMirrorProps) => {
  const [ref, measurements] = useMeasure<HTMLDivElement>()
  return (
    <div className={clsx('h-full', props.className)} ref={ref}>
      <SqlCodeMirror {...props} height={measurements.height + 'px'} />
    </div>
  )
}

export const SqlCodeMirror = ({code, onChange, onExecute, errors, height, ...props}: SqlCodeMirrorProps) => {
  const onEditorChange = React.useCallback(
    ((value, _ev) => {
      onChange?.(value || '')
    }) satisfies Parameters<typeof CodeMirror>[0]['onChange'],
    [onChange],
  )

  const schema = useInspected()
  const searchPath = useSearchPath()

  const extensions = React.useMemo(() => {
    const executeKeymapHandler = (v: EditorView) => {
      const selected = v.state.selection.main
      const selection = v.state.sliceDoc(selected.from, selected.to)
      // if there's a specific selection, pad it with spaces so error positions line up correctly
      const query = selection ? ' '.repeat(selected.from) + selection : v.state.doc.toString()
      onExecute?.(query)
      return true
    }

    const keymapExtension = Prec.highest(
      keymap.of([
        {
          key: 'Cmd-Enter',
          run: executeKeymapHandler,
        },
        {
          win: 'Ctrl-Enter',
          run: executeKeymapHandler,
        },
        {
          key: 'Tab',
          run: target => acceptCompletion(target),
        },
      ]),
    )

    const linterExtension = linter(v => {
      return (errors || []).map(e => {
        const {from, to} = v.state.wordAt(e.position) || {from: e.position, to: e.position + 1}
        const unknownErrorMessage = `Unknown error. If this error came from the server, it may need a custom serializer - Errors by default are serialized to '{}'`
        return {
          from,
          to,
          message: [e.message].flat().join('\n').split('\n')[0] || unknownErrorMessage,
          severity: 'error',
        }
      })
    })

    const baseExtensions: Extension[] = [
      keymapExtension,
      sql(),
      linterExtension,
      lintGutter(),
      EditorState.readOnly.of(props.readonly || false),
      props.wrapText ? EditorView.lineWrapping : [],
    ]
    if (!schema || !searchPath) {
      return baseExtensions
    }

    const {suggest} = getSuggester({schema, searchPath})

    const dbCompletions: CompletionSource = context => {
      if (context.matchBefore(/;/)?.text) return null

      const word = context.matchBefore(/\w*/)

      const fullText = context.state.doc.toString()
      const line = context.state.doc.lineAt(context.state.selection.main.head)
      const column = context.state.selection.main.head - line.from + 1
      const {suggestions} = suggest(fullText, {line: line.number, column}, {explicit: context.explicit})

      return {
        from: word?.from ?? context.pos,
        filter: !word, // codemirror will automatically sort based on word matching. it's usually good but when we have a blank slate, it defaults to alphabetical. filter forces it to respect the order passed: https://discuss.codemirror.net/t/how-to-ensure-that-the-options-passed-in-autocomplete-are-not-filtered-and-sorted-again/4591/2
        options: suggestions.map(s => {
          return {
            label: s.text,
            type: typeMap[s.type],
            detail: s.detail || s.type,
          }
        }),
      }
    }

    const dbAutocompletion = autocompletion({
      override: [dbCompletions],
      closeOnBlur: false,
    })
    return [...baseExtensions, dbAutocompletion]
  }, [schema, onExecute, errors, searchPath, props.wrapText])

  return (
    <CodeMirror
      height={height} //
      value={code}
      onChange={onEditorChange}
      extensions={extensions}
      theme="dark"
    />
  )
}

type CodeMirrorTypes =
  | 'class'
  | 'constant'
  | 'enum'
  | 'function'
  | 'interface'
  | 'keyword'
  | 'method'
  | 'namespace'
  | 'property'
  | 'text'
  | 'type'
  | 'variable'

const typeMap: Record<SuggestionType, CodeMirrorTypes> = {
  aggregate: 'function',
  column: 'property',
  function: 'function',
  keyword: 'keyword',
  table: 'class',
  view: 'interface',
}
