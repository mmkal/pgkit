/* eslint-disable mmkal/import/no-extraneous-dependencies */
import {type CompletionSource, acceptCompletion, autocompletion} from '@codemirror/autocomplete'
import {sql} from '@codemirror/lang-sql'
import {linter} from '@codemirror/lint'
import {Prec} from '@codemirror/state'
import {type EditorView, keymap} from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
/* eslint-enable mmkal/import/no-extraneous-dependencies */
import React from 'react'
import {PostgreSQLJson, SuggestionType, getSuggester} from '../packlets/autocomplete/suggest'

export interface SqlCodeMirrorProps {
  code: string
  onChange: (query: string) => void
  onExecute: (sql: string) => void
  inspected: PostgreSQLJson | null | undefined
  searchPath: string | undefined
  errors: Array<{position: number; message: string}>
}

export const SqlCodeMirror = ({
  code,
  onChange,
  onExecute,
  inspected: schema,
  searchPath,
  errors,
}: SqlCodeMirrorProps) => {
  const onEditorChange = React.useCallback(
    ((value, _ev) => {
      onChange(value || '')
    }) satisfies Parameters<typeof CodeMirror>[0]['onChange'],
    [onChange],
  )

  const extensions = React.useMemo(() => {
    const executeKeymapHandler = (v: EditorView) => {
      const selected = v.state.selection.main
      const selection = v.state.sliceDoc(selected.from, selected.to)
      // if there's a specific selection, pad it with spaces so error positions line up correctly
      const query = selection ? ' '.repeat(selected.from) + selection : v.state.doc.toString()
      onExecute(query)
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
      return errors.map(e => {
        const {from, to} = v.state.wordAt(e.position) || {from: e.position, to: e.position + 1}
        return {from, to, message: e.message, severity: 'error'}
      })
    })

    const baseExtensions = [keymapExtension, sql(), linterExtension]
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
  }, [schema, onExecute, errors, searchPath])

  return (
    <CodeMirror
      height="calc(50vh - 60px)"
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
