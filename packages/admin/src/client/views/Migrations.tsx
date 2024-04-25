import clsx from 'clsx'
import React from 'react'
import {useLocalStorage} from 'react-use'
import {MeasuredCodeMirror} from '../sql-codemirror'
import {createCascadingState} from '../utils/cascading-state'
import {trpc} from '../utils/trpc'
import {parseFileTree, basename, File, Folder, commonPrefix} from './file-tree'
import {Button} from '@/components/ui/button'
import {CollapsibleTrigger, CollapsibleContent, Collapsible} from '@/components/ui/collapsible'
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

function _Migrations() {
  const [fileState] = file.useState()
  const [workingFS, setWorkingFS] = workingFSContext.useState()
  const util = trpc.useUtils()
  const list = trpc.migrations.list.useQuery()
  const mutationConfig = {
    onSuccess: () => util.migrations.invalidate(),
  }
  const create = trpc.migrations.create.useMutation(mutationConfig)
  const up = trpc.migrations.up.useMutation(mutationConfig)
  const down = trpc.migrations.down.useMutation(mutationConfig)
  const update = trpc.migrations.update.useMutation(mutationConfig)
  const downify = trpc.migrations.downify.useMutation(mutationConfig)
  const definitions = trpc.migrations.definitions.useMutation(mutationConfig)

  const filesData = React.useMemo(() => {
    const fsEntries = (list.data?.migrations || [])
      .flatMap(m => {
        return [
          [m.path, m.content],
          [m.downPath!, m.downContent!],
        ] as Array<[string, string]>
      })
      .concat(list.data?.definitions.content ? [[list.data.definitions.filepath, list.data.definitions.content]] : [])
      .filter(e => e[0])
      .sort((a, b) => a[0].localeCompare(b[0]))
    const fsJson = Object.fromEntries(fsEntries)
    const files = fsEntries.map(e => e[0])
    const current = list.data?.migrations.find(f => f.path === fileState)

    const workingContent = !current || workingFS[current.path] === current.content ? undefined : workingFS[current.path]

    return {
      fsEntries,
      fsJson: fsJson,
      currentFile: current && {...current, workingContent},
      rootFileTree: parseFileTree(files, commonPrefix(files)),
    }
  }, [list.data, fileState, workingFS])

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
              <div className="flex">
                <Button title="Create migration" onClick={() => create.mutate({name: prompt('name?')!})}>
                  <icons.SquarePlus />
                </Button>
                <Button title="Revert migrations" onClick={() => down.mutate()}>
                  <icons.CircleArrowDown />
                </Button>
                <Button title="Apply migrations" onClick={() => up.mutate()}>
                  <icons.CircleArrowUp />
                </Button>
                <Button title="Create definitions file" onClick={() => definitions.mutate()}>
                  <icons.Book />
                </Button>
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
          <header className="flex h-14 lg:h-[60px] w-full items-center gap-4 DISABLEDborder-b DISABLEDbg-gray-100/40 px-6 dark:bg-gray-800/40">
            {`${basename(fileState)} (${filesData.currentFile?.status || ''})`.replace(' ()', '')}
            <div className="w-full flex-1 flex flex-row justify-end">
              <form>
                <div className="hidden  relative">
                  <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 DISABLEDtext-gray-500 dark:DISABLEDtext-gray-400" />
                  <Input
                    className="w-full DISABLEDbg-white shadow-none appearance-none pl-8 md:w-2/3 lg:w-1/3 dark:bg-gray-950"
                    placeholder="Search files..."
                    type="search"
                  />
                </div>
              </form>
              <Button
                title="Autogenerate down migration"
                disabled={!filesData.currentFile}
                onClick={() => downify.mutate({name: filesData.currentFile!.name})}
              >
                <icons.MoveDown />
                <icons.Wand />
              </Button>
              <Button
                title="Delete"
                disabled={filesData.currentFile?.status === 'executed'}
                onClick={() => update.mutate({path: fileState, content: null})}
              >
                <icons.Trash2 />
              </Button>
              <Button
                title="Save"
                disabled={!filesData.currentFile?.workingContent}
                onClick={() => update.mutate({path: fileState, content: filesData.currentFile!.workingContent!})}
              >
                <icons.Save />
              </Button>
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

function SearchIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

const _sampleFilesJson: Record<string, string> = {
  'a/create-products-table.sql':
    'create table products (id serial primary key, name text not null, price integer not null)',
  'a/create-users-table.sql': 'create table users (id serial primary key, email text not null, password text not null)',
  'a/create-orders-table.sql':
    'create table orders (id serial primary key, user_id integer not null, product_id integer not null)',
}

const _sampleFiles = Object.keys(_sampleFilesJson)

export const FileTree = (tree: File | Folder) => {
  const [_, setFileState] = file.useState()
  const list = trpc.migrations.list.useQuery()

  if (tree.type === 'file') {
    const fileInfo = list.data?.migrations.find(f => f.path === tree.path)
    return (
      <div className="flex cursor-pointer items-center rounded-lg DISABLEDpx-3 DISABLEDpy-2 px-px DISABLEDtext-gray-500 transition-all hover:text-gray-200 dark:DISABLEDtext-gray-400 dark:DISABLEDhover:text-gray-50">
        <Button
          className="w-full inline-flex gap-2 justify-between relative px-2"
          title={tree.path}
          onClick={() => setFileState(tree.path)}
        >
          <span className="inline-flex">
            <icons.File className="mr-2 h-4 w-4" />
            {basename(tree.path)}
          </span>
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
      </div>
    )
  }

  if (tree.baseDir.startsWith(tree.path) && tree.children.length == 1) {
    return <FileTree {...tree.children[0]} />
  }

  return (
    <>
      <Collapsible defaultOpen={tree.path === tree.baseDir.replace(/\/$/, '')}>
        <CollapsibleTrigger asChild>
          <div
            title={tree.path}
            className="flex cursor-pointer items-center align-middle Djustify-between gap-1 rounded-lg px-2 py-2 DISABLEDtext-gray-500 transition-all hover:text-gray-200 dark:DISABLEDtext-gray-400 dark:DISABLEDhover:text-gray-50"
          >
            <icons.Folder className="h-4 w-4" />
            <span>{basename(tree.path)}</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid pl-4">{tree.children?.map(child => <FileTree key={child.path} {...child} />)}</div>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
