import {ContextMenuTrigger} from '@radix-ui/react-context-menu'
import clsx from 'clsx'
import React from 'react'
import {useLocalStorage} from 'react-use'
import {toast} from 'sonner'
import {MeasuredCodeMirror} from '../sql-codemirror'
import {MutationButton} from '../utils/MutationButton'
import {createCascadingState} from '../utils/cascading-state'
import {useConfirmable} from '../utils/destructive'
import {trpc} from '../utils/trpc'
import {parseFileTree, basename, File, Folder, commonPrefix} from './file-tree'
import {Button} from '@/components/ui/button'
import {CollapsibleTrigger, CollapsibleContent, Collapsible} from '@/components/ui/collapsible'
import {ContextMenu, ContextMenuContent, ContextMenuItem} from '@/components/ui/context-menu'
import {icons} from '@/components/ui/icons'
import {Input} from '@/components/ui/input'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@/components/ui/resizable'
import {Separator} from '@/components/ui/separator'

export function ResizableDemo() {
  return (
    <ResizablePanelGroup direction="horizontal" className="max-w-md rounded-lg border">
      <ResizablePanel defaultSize={50}>
        <div className="flex h-[200px] items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={25}>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Two</span>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={75}>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Three</span>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export const Link = (props: React.AnchorHTMLAttributes<{}>) => <a {...props} />

export type SVGProps = React.DetailedHTMLProps<React.HTMLAttributes<SVGSVGElement>, SVGSVGElement>

const file = createCascadingState('', v => useLocalStorage('file.0.0.1', v))

const workingFSContext = createCascadingState({} as Record<string, string>, v => useLocalStorage('workingFS.0.0.1', v))

// eslint-disable-next-line prefer-arrow-callback
export const Migrations = file.wrap(workingFSContext.wrap(_Migrations))

const useMigrations = () => {
  const util = trpc.useUtils()
  const mutationConfig = {
    onSuccess: async () => {
      await Promise.all([
        util.migrations.invalidate(),
        util.inspect.invalidate(),
        util.migrations.definitions.invalidate(),
      ])
    },
  }

  const list = trpc.migrations.rawList.useQuery()

  const create = trpc.migrations.create.useMutation()
  const up = trpc.migrations.up.useMutation(mutationConfig)
  const down = useConfirmable(trpc.migrations.goto.useMutation(mutationConfig))
  const rebase = trpc.migrations.rebase.useMutation({
    onSuccess: async data => {
      await mutationConfig.onSuccess()
      toast.success(`Migrations rebased successfully. Last executed migration now set to: ${data.at(-1)?.name}`)
    },
  })
  const check = trpc.migrations.check.useMutation({
    ...mutationConfig,
    onSuccess: () => toast.success('Migrations are in a valid state'),
  })
  const repair = useConfirmable(trpc.migrations.repair.useMutation(mutationConfig))

  const update = trpc.migrations.update.useMutation(mutationConfig)
  const definitions = trpc.migrations.definitions.filepath.useQuery()
  const updateDefintionsFromDB = trpc.migrations.definitions.updateFile.useMutation(mutationConfig)
  const updateDBFromDefinitions = useConfirmable(trpc.migrations.definitions.updateDb.useMutation(mutationConfig))

  return {
    list,
    create,
    up,
    down,
    rebase: useConfirmable(rebase),
    check,
    repair,
    update,
    definitions,
    updateDefintionsFromDB,
    updateDBFromDefinitions,
  }
}

function _Migrations() {
  const [fileState] = file.useState()
  const [workingFS, setWorkingFS] = workingFSContext.useState()

  const list = trpc.migrations.rawList.useQuery()
  const definitions = trpc.migrations.definitions.filepath.useQuery()

  const filesData = React.useMemo(() => {
    const fsEntries = (list.data || [])
      .flatMap(m => {
        return [[m.path, m.content]] as Array<[string, string]>
      })
      .concat(definitions.data?.content ? [[definitions.data.path, definitions.data.content]] : [])
      .filter(e => e[0])
      .sort((x, y) => x[0].localeCompare(y[0]))
    const fsJson = Object.fromEntries(fsEntries)
    const files = fsEntries.map(e => e[0])
    let current: {path: string; content: string | null; status?: 'pending' | 'executed'} | undefined = list.data?.find(
      f => f.path === fileState,
    )
    if (!current && fileState === definitions.data?.path) {
      current = definitions.data
    }

    const workingContent = !current || workingFS[current.path] === current.content ? undefined : workingFS[current.path]

    return {
      fsEntries,
      fsJson: fsJson,
      currentFile: current && {...current, workingContent},
      rootFileTree: parseFileTree(files, commonPrefix(files)),
    }
  }, [list.data, fileState, workingFS])

  const numPending = list.data?.filter(m => m.status === 'pending').length

  return (
    // <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
    <ResizablePanelGroup direction="horizontal" className="w-full h-full rounded-lg">
      <ResizablePanel defaultSize={50}>
        <section
          data-section="migrations-sidebar"
          className=" h-full border-r DISABLEDbg-gray-100/40 dark:bg-gray-800/40"
        >
          <div className="flex h-full max-h-screen flex-col gap-2">
            <div className="flex justify-between h-[60px] items-center border-b pl-3">
              <span className="font-semibold">Migrations</span>
              <div className="flex gap-1 pr-1.5">
                <MutationButton title="Wipe DB" icon="Bomb" mutation={trpc.migrations.wipe} />
                <MutationButton
                  title="Create migration"
                  icon="SquarePlus"
                  mutation={trpc.migrations.create}
                  args={() => {
                    const name = prompt('name?')
                    if (!name) return null

                    return [{name}] as const
                  }}
                />
                {/* <Button
                  title="Create migration"
                  onClick={() => {
                    const name = prompt('name?')
                    if (name) create.mutate({name})
                  }}
                >
                  <icons.SquarePlus />
                </Button> */}

                {/* <ContextMenu>
                  <ContextMenuTrigger>
                    <Button title="Revert migrations" onClick={async () => down.mutate()}>
                      <icons.CircleArrowDown />
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="mt-5 bg-gray-800 text-gray-100">
                    {!numExecuted && <ContextMenuItem disabled>No migrations to revert</ContextMenuItem>}
                    {Boolean(numExecuted) && (
                      <ContextMenuItem onClick={() => down.mutate({to: 0})}>
                        <icons.CircleArrowDown />
                        <icons.Bomb className="mr-2" />
                        Revert all migrations
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu> */}
                <ContextMenu>
                  <ContextMenuTrigger>
                    <MutationButton title="Apply migrations" icon="CircleArrowUp" mutation={trpc.migrations.up} />
                  </ContextMenuTrigger>
                  <ContextMenuContent className="mt-5 bg-gray-800 text-gray-100">
                    {!numPending && <ContextMenuItem disabled>No migrations to apply</ContextMenuItem>}
                    {/* {Array.from({length: numPending || 0}).map((_, i) => {
                      const step = i + 1

                      const Icon = icons[`Tally${step}` as 'Tally1']
                      return (
                        <ContextMenuItem key={step} onClick={() => up.mutate({step})}>
                          <icons.CircleArrowUp />
                          {Icon && <Icon />}
                          Apply {step} migration{step > 1 ? 's' : ''}
                        </ContextMenuItem>
                      )
                    })} */}
                    {/* <ContextMenuItem onClick={() => up.mutate({step: 1})}>
                      <icons.CircleArrowUp />
                      <icons.Tally1 />
                      Apply 1 migration
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => up.mutate({step: 2})}>
                      <icons.CircleArrowUp />
                      <icons.Tally2 />
                      Apply 2 migrations
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => up.mutate({step: 3})}>
                      <icons.CircleArrowUp />
                      <icons.Tally3 />
                      Apply 3 migrations
                    </ContextMenuItem> */}
                  </ContextMenuContent>
                </ContextMenu>
                <MutationButton
                  title="Create definitions file"
                  icon="Book"
                  mutation={trpc.migrations.definitions.updateFile}
                />
                <MutationButton
                  title="Repair migrations"
                  icon="Wrench"
                  mutation={trpc.migrations.repair}
                  options={{
                    onSuccess: data => {
                      const message = data.updated
                        ? 'Database state repaired successfully'
                        : 'Database state was already valid'
                      toast.success(message)
                    },
                  }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto py-2">
              <nav className="grid items-start DISABLEDpx-4 text-sm font-medium">
                {filesData.rootFileTree.children.map(child => (
                  <FileTree key={child.path} {...child} />
                ))}
              </nav>
              <Separator className="my-4" />
              <div className="px-4">
                <Input
                  className="hidden w-full DISABLEDbg-white shadow-none appearance-none pl-8 dark:bg-gray-950"
                  placeholder="Filter files..."
                  type="search"
                />
              </div>
            </div>
          </div>
        </section>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <section data-section="migrations-file" className="flex flex-col h-full">
          <header className="flex h-14 lg:h-[60px] w-full items-center gap-4 DISABLEDborder-b DISABLEDbg-gray-100/40 px-6 DISABLEDdark:bg-gray-800/40">
            {`${basename(fileState)} (${filesData.currentFile?.status || ''})`.replace(' ()', '')}
            <div className="w-full flex-1 flex flex-row justify-end">
              <form>
                <div className="hidden  relative">
                  <icons.Search className="absolute left-2.5 top-2.5 h-4 w-4 DISABLEDtext-gray-500 dark:DISABLEDtext-gray-400" />
                  <Input
                    className="w-full DISABLEDbg-white shadow-none appearance-none pl-8 md:w-2/3 lg:w-1/3 dark:bg-gray-950"
                    placeholder="Search files..."
                    type="search"
                  />
                </div>
              </form>
              <MutationButton
                title="Delete"
                icon="Trash2"
                mutation={trpc.migrations.update}
                args={[{path: fileState, content: null}]}
              />
              <MutationButton
                title="Save"
                icon="Save"
                mutation={trpc.migrations.update}
                options={{
                  onSuccess: data => {
                    alert('saved it' + JSON.stringify(data))
                    setWorkingFS({...workingFS, [fileState]: undefined as never})
                  },
                }}
                args={() => [{path: fileState, content: filesData.currentFile!.workingContent!.slice()}] as const}
                disabled={!filesData.currentFile?.workingContent}
              />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            {!fileState && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <icons.File className="mx-auto h-12 w-12 DISABLEDtext-gray-400" />
                  <h3 className="mt-2 text-sm font-medium DISABLEDtext-gray-900 dark:DISABLEDtext-gray-50">
                    No file selected
                  </h3>
                  <p className="mt-1 text-sm DISABLEDtext-gray-500 dark:DISABLEDtext-gray-400">
                    Select a file from the sidebar to view its contents.
                  </p>
                </div>
              </div>
            )}
            {filesData.fsJson[fileState] && (
              <MeasuredCodeMirror
                code={filesData.fsJson[fileState]}
                onChange={code => setWorkingFS({...workingFS, [fileState]: code})}
                readonly={filesData.currentFile?.status === 'executed'}
              />
            )}
          </main>
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
    // </div>
  )
}

const _sampleFilesJson: Record<string, string> = {
  'a/create-products-table.sql':
    'create table products (id serial primary key, name text not null, price integer not null)',
  'a/create-users-table.sql': 'create table users (id serial primary key, email text not null, password text not null)',
  'a/create-orders-table.sql':
    'create table orders (id serial primary key, user_id integer not null, product_id integer not null)',
}

export const FileTree = (tree: File | Folder) => {
  const [fileState, setFileState] = file.useState()

  const {up, down, rebase, list, definitions, updateDBFromDefinitions} = useMigrations()

  if (tree.type === 'file') {
    const fileInfo = list.data?.find(f => f.path === tree.path)
    return (
      <div className="flex cursor-pointer items-center rounded-lg DISABLEDpx-3 DISABLEDpy-2 px-px DISABLEDtext-gray-500 transition-all hover:text-gray-200 dark:DISABLEDtext-gray-400 dark:DISABLEDhover:text-gray-50">
        <ContextMenu>
          <ContextMenuTrigger className="w-full">
            <Button
              className="w-full inline-flex gap-2 justify-between relative px-2"
              title={tree.path}
              onClick={() => setFileState(tree.path)}
            >
              <span className={clsx('inline-flex', tree.path === fileState && 'underline')}>
                <icons.File className="mr-2 h-4 w-4" />
                {basename(tree.path)}
              </span>
              {tree.path === definitions.data?.path && (
                <ContextMenuContent className="mt-5 bg-gray-800 text-gray-100">
                  <ContextMenuItem className="p-0">
                    <Button className="gap-2 flex-1 justify-start" onClick={() => updateDBFromDefinitions.mutate()}>
                      <icons.Book />
                      Update database to match this definitions file
                    </Button>
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
              {fileInfo?.status === 'pending' && (
                <ContextMenuContent className="mt-5 bg-gray-800 text-gray-100">
                  <ContextMenuItem className="p-0">
                    <MutationButton icon="CircleArrowUp" mutation={trpc.migrations.up} args={[{to: fileInfo.name}]}>
                      Apply migrations up to this one
                    </MutationButton>
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
              {fileInfo?.status === 'executed' && (
                <ContextMenuContent className="mt-5 bg-gray-800 text-gray-100">
                  <ContextMenuItem className="p-0">
                    <MutationButton
                      className="gap-2 flex-1 justify-start"
                      icon="CircleArrowDown"
                      mutation={trpc.migrations.goto}
                      args={[{name: fileInfo.name}]}
                    >
                      Revert migrations down to this one
                    </MutationButton>
                  </ContextMenuItem>
                  <ContextMenuItem className="p-0">
                    <MutationButton
                      className="gap-2 flex-1 justify-start"
                      icon="Briefcase"
                      mutation={trpc.migrations.rebase}
                      args={[{from: fileInfo.name}]}
                    >
                      Rebase migrations from this one
                    </MutationButton>
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
              <span
                className={clsx(
                  'justify-self-end',
                  fileInfo?.status === 'executed' && 'text-green-500 block',
                  fileInfo?.status === 'pending' && 'text-yellow-200 block',
                )}
              >
                {fileInfo?.status}
              </span>
            </Button>
          </ContextMenuTrigger>
        </ContextMenu>
      </div>
    )
  }

  if (tree.baseDir.startsWith(tree.path) && tree.children.length == 1) {
    return <FileTree {...tree.children[0]} />
  }

  return (
    <>
      <Collapsible
        className="group/collapsible w-full"
        open={fileState.startsWith(tree.path) || undefined}
        defaultOpen={basename(tree.path) !== 'down'}
      >
        <CollapsibleTrigger asChild>
          <div
            title={tree.path}
            className="flex w-full relative cursor-pointer items-center align-middle justify-start rounded-lg px-2 py-2 text-gray-400 transition-all hover:text-gray-200 dark:text-gray-400 dark:hover:text-gray-50"
          >
            <icons.Folder className="mr-2 h-4 w-4" />
            <span>{basename(tree.path)}</span>
            {/* <icons.ChevronLeft className="justify-self-end w-4 h-4 group-data-[state=open]/collapsible:-rotate-90 transition-transform" /> */}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid pl-4">{tree.children?.map(child => <FileTree key={child.path} {...child} />)}</div>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
