import clsx from 'clsx'
import React from 'react'

import {useLocalStorage} from 'react-use'
import logo from './images/pgkit_transparent_cropped.png'
import {SettingsPanel} from './settings'
import {useInspected} from './utils/inspect'
import {Inspector} from './views/Inspector'
import {Migrations} from './views/Migrations'
import {Querier} from './views/Querier'
import {Table} from './views/Table'
import {Button} from '@/components/ui/button'
import {CollapsibleTrigger, CollapsibleContent, Collapsible} from '@/components/ui/collapsible'
import {icons} from '@/components/ui/icons'
import {Input} from '@/components/ui/input'

export const Link = (props: React.AnchorHTMLAttributes<{}>) => <a {...props} />

export type SVGProps = React.DetailedHTMLProps<React.HTMLAttributes<SVGSVGElement>, SVGSVGElement>

const views = ['sql', 'inspector', 'settings', 'table', 'migrations'] as const
type View = (typeof views)[number]

type ViewConfig = {
  title?: string
  icon: (props: {className: string}) => React.ReactNode
  component: React.ComponentType
  className?: string
}

const viewConfigs: Record<View, ViewConfig | null> = {
  sql: {
    title: 'SQL editor',
    icon: icons.Terminal,
    component: Querier,
  },
  inspector: {
    icon: icons.Database,
    component: Inspector,
    className: 'p-5',
  },
  migrations: {
    icon: icons.Files,
    component: Migrations,
  },
  table: null,
  settings: {
    className: 'p-5',
    icon: icons.Settings,
    component: SettingsPanel,
  },
}

export default function Component() {
  const [view, setView] = useLocalStorage<View>('view.0.0.1', 'sql')
  const [tableIdentifier, setTableIdentifier] = useLocalStorage('tableName.0.0.1', '')

  const inspected = useInspected()

  const viewConfig = viewConfigs[view!]

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex flex-col w-[250px] bg-gray-800 text-gray-100">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <Link className="flex items-center gap-2" href="#">
            {/* <DatabaseIcon className="w-6 h-6" /> */}
            <img src={logo} alt="pgkit" height={10} className="h-12" />
            {/* <h2 className="text-lg font-semibold">SQL Admin</h2> */}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-2">
            {Object.entries(viewConfigs).map(([key, config]) => {
              const v = key as View
              if (!config) return null

              const Icon = config.icon
              return (
                <Button
                  key={v}
                  onClick={() => setView(v)}
                  variant={view === v ? 'secondary' : 'ghost'}
                  className={clsx(
                    'justify-start gap-2 w-full px-4 hover:bg-gray-700 capitalize',
                    view === v && 'bg-gray-600', //
                  )}
                  size="sm"
                >
                  <Icon className="w-4 h-4" />
                  {config.title || v}
                </Button>
              )
            })}
          </nav>
          <div className="border-t border-gray-700 mt-4 pt-4">
            <div className="px-4 mb-4">
              <Input
                className="hidden w-full bg-gray-700 text-gray-100 placeholder-gray-400 rounded-md px-3 py-2"
                placeholder="Search tables..."
                type="search"
              />
            </div>
            <Collapsible defaultOpen className="group/collapsible">
              <div className="flex items-center justify-between px-4">
                <h4 className="text-sm font-semibold">Tables</h4>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost">
                    {/* https://github.com/tailwindlabs/tailwindcss/discussions/11768#discussioncomment-6663339 */}
                    <icons.ChevronLeft className="w-4 h-4 group-data-[state=open]/collapsible:-rotate-90 transition-transform" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="px-1">
                {Object.entries(inspected?.tables || {}).map(([key, table]) => (
                  <Button
                    key={key}
                    className="gap-1 text-left justify-start w-full rounded-md px-3 py-1 text-xs hover:bg-gray-700"
                    variant="ghost"
                    onClick={() => {
                      setView('table')
                      setTableIdentifier(key)
                    }}
                  >
                    <icons.Table className="w-[15px]" />
                    {table.name}
                  </Button>
                ))}
                {/* <Link className="block w-full rounded-md px-3 py-1 text-sm hover:bg-gray-700" href="#">
                  users
                </Link>
                <Link className="block w-full rounded-md px-3 py-1 text-sm hover:bg-gray-700" href="#">
                  products
                </Link>
                <Link className="block w-full rounded-md px-3 py-1 text-sm hover:bg-gray-700" href="#">
                  orders
                </Link> */}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-gray-900 dark:bg-gray-900 w-[calc(100vw-250px)]">
        <div className={clsx('flex-1 overflow-hidden', viewConfig?.className)}>
          {viewConfig && <viewConfig.component />}
          {view === 'table' && tableIdentifier && (
            <div className="p-4 dark:bg-gray-900">
              <div className="border rounded-lg overflow-auto bg-gray-800 text-gray-100">
                <Table identifier={tableIdentifier} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
