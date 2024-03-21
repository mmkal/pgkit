import './grid.scss'
import '@silevis/reactgrid/styles.css'

import * as reactGrid from '@silevis/reactgrid'
import React from 'react'
import * as jsonView from 'react-json-view-lite'
import {Popover} from 'react-tiny-popover'

export interface ResultsViewerParams {
  values: unknown[]
}

export const ResultsViewer = (params: ResultsViewerParams) => {
  if (params.values.length === 0) return <div>No data</div>

  return <_ResultsViewer {...params} />
}

const _ResultsViewer = ({values}: ResultsViewerParams) => {
  const rows = React.useMemo(() => values.map(r => (r && typeof r === 'object' ? r : {})), [values])
  const [columns, setColumns] = React.useState<reactGrid.Column[]>(() => [
    {columnId: 'row', width: 1, resizable: false, reorderable: false},
    ...Object.keys(rows.at(0) || {}).map(key => ({columnId: key, resizable: true, reorderable: true})),
  ])
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
          {type: 'header', text: String(i + 1), className: 'rowNumberer'},
          ...Object.entries(r)
            .map(([_k, v]): reactGrid.DefaultCellTypes => {
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
      <jsonView.JsonView data={data as {}} shouldExpandNode={jsonView.collapseAllNested} style={jsonView.darkStyles} />,
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
