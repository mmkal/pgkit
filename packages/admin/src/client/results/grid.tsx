import './grid.scss'
import '@silevis/reactgrid/styles.css'

import * as reactGrid from '@silevis/reactgrid'
import React from 'react'
import * as jsonView from 'react-json-view-lite'
import {Popover} from 'react-tiny-popover'
import {useMeasure} from 'react-use'

export interface ResultsViewerParams {
  /** array of values that will be rendered in a grid. Note: the first row is used for the column names */
  values: unknown[]
  /** If specified, these will be the column headers. If specified with an empty `values` array, an row of empties will be rendered */
  columnNames?: string[]
  /** number rows starting at this value. @default 0 */
  offset?: number
}

const EMPTY = Symbol('empty')

export const ResultsViewer = (params: ResultsViewerParams) => {
  if (params.values.length === 0 && params.columnNames?.length) {
    return <_ResultsViewer {...params} values={[Object.fromEntries(params.columnNames.map(c => [c, EMPTY]))]} />
  }

  if (params.values.length === 0) {
    return <div>No data</div>
  }

  return <_ResultsViewer {...params} />
}

const _ResultsViewer = ({values, offset: startAt = 0, columnNames: maybeColumnNames}: ResultsViewerParams) => {
  const [ref, measurements] = useMeasure()
  const rows = React.useMemo(() => values.map(r => (r && typeof r === 'object' ? r : {})), [values])
  const columnNames = React.useMemo(() => maybeColumnNames || Object.keys(rows.at(0) || {}), [maybeColumnNames, rows])
  const defaultWidth = Math.max(150, (measurements.width - 50) / columnNames.length)
  const [columns, setColumns] = React.useState<reactGrid.Column[]>(() => {
    return [
      {columnId: 'row', width: 1, resizable: false, reorderable: false},
      ...columnNames.map(key => ({columnId: key, resizable: true, reorderable: true, width: defaultWidth})),
    ]
  })

  React.useEffect(() => {
    setColumns(prevColumns => prevColumns.map((c, i) => (i === 0 ? c : {...c, width: defaultWidth})))
  }, [defaultWidth])

  const gridRows = React.useMemo(() => {
    return [
      {
        rowId: -1,
        cells: [
          {type: 'header', text: '-'},
          ...Object.keys(rows.at(0) || {}).map((e): reactGrid.DefaultCellTypes => {
            return {type: 'header' as const, text: e}
          }),
        ],
      },
      ...rows.map((r, i) => ({
        rowId: i,
        cells: [
          {type: 'header', text: String(i + startAt + 1), className: 'rowNumberer'},
          ...columnNames
            .map((k): reactGrid.DefaultCellTypes => {
              const v = (r as Record<string, unknown>)?.[k]
              if (v === EMPTY) {
                return {type: 'text', text: '', nonEditable: true}
              }

              if (typeof v === 'number') {
                return {type: 'number', value: v}
              }

              if (typeof v === 'boolean') {
                return {type: 'checkbox', checked: v}
              }

              if ((v && typeof v === 'object') || (typeof v === 'string' && v.length > 50)) {
                return {
                  type: 'text',
                  text: JSON.stringify(v),
                  renderer: () => <JsonCell data={v as unknown} />,
                  nonEditable: true,
                }
              }

              return {type: 'text', text: String(v), nonEditable: true}
            })
            .map(c => ({...c, nonEditable: true})),
        ],
      })),
    ]
  }, [rows])

  const onColumnResized = React.useCallback<NonNullable<reactGrid.ReactGridProps['onColumnResized']>>((ci, width) => {
    setColumns(prevColumns => prevColumns.map(c => (c.columnId === ci ? {...c, width} : c)))
  }, [])

  return (
    <div style={{position: 'relative'}} ref={ref as never}>
      {/* <button style={{position: 'absolute', top: -50, right: 0}} onClick={() => console.log(gridRows)}>
        download
      </button> */}
      <reactGrid.ReactGrid
        columns={columns}
        rows={gridRows}
        enableFillHandle={true}
        enableRangeSelection={true}
        enableRowSelection={true}
        enableColumnSelection={true}
        onColumnResized={onColumnResized}
        stickyTopRows={1}
      />
    </div>
  )
}

const JsonCell = ({data}: {data: unknown}) => {
  const text = React.useMemo(() => JSON.stringify(data), [data])
  const pretty = React.useMemo(() => JSON.stringify(data, null, 2), [data])
  const [popover, setPopover] = React.useState('' as React.JSX.Element | string)
  const [copyButton, setCopyButton] = React.useState('📋')
  const showJson = React.useCallback(() => {
    if (popover) {
      setPopover('')
      return
    }

    setPopover(
      <jsonView.JsonView
        data={data as {}}
        shouldExpandNode={jsonView.collapseAllNested}
        style={{
          ...jsonView.darkStyles,
        }}
      />,
    )
  }, [popover, data])

  const copyData = React.useCallback(
    async (ev: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
      await navigator.clipboard.writeText(pretty)
      setCopyButton('✅')
      setTimeout(() => setCopyButton('📋'), 2000)
      ev.stopPropagation()
      ev.preventDefault()
    },
    [pretty],
  )

  return (
    <div style={{width: '100%'}}>
      <Popover
        isOpen={Boolean(popover)}
        containerStyle={{zIndex: `var(--popover-z-index)`}}
        onClickOutside={() => setPopover('')}
        positions={['bottom', 'right', 'top', 'left']}
        content={
          <div onClick={ev => ev.stopPropagation()} style={{border: '2px solid white'}}>
            {popover}
          </div>
        }
      >
        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
          <button className="jsonCellButton" onClick={showJson}>
            {text}
          </button>
          <button className="jsonCellCopyButton" onClick={ev => void copyData(ev)}>
            {copyButton}
          </button>
        </div>
      </Popover>
    </div>
  )
}
