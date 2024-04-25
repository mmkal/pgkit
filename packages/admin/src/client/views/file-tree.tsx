export const basename = (path: string) => path.split('/').pop()!
export function takeWhile<T>(arr: T[], predicate: (value: T, index: number, array: T[]) => boolean) {
  const result: T[] = []
  for (const [i, t] of arr.entries()) {
    if (!predicate(t, i, arr)) break
    result.push(t)
  }
  return result
}
export const commonPrefix = (paths: string[], divider = '') => {
  if (paths.length === 0) return ''
  console.log(JSON.stringify(paths))
  return takeWhile(paths[0].split(divider), (part, i) => paths.every(p => p.split(divider)[i] === part)).join(divider)
}

export type File = {type: 'file'; path: string; baseDir: string}
export type Folder = {type: 'folder'; path: string; baseDir: string; children: (File | Folder)[]}

export function parseFileTree(files: string[], baseDir = '/') {
  const tree: Folder = {type: 'folder', path: '/', baseDir, children: []}
  for (const f of files) {
    const parts = f.split('/')
    let current = tree
    parts.forEach((part, i) => {
      const existing = (current.children as Folder[]).find(c => basename(c.path) === part)
      if (existing) {
        current = existing
      } else if (i === parts.length - 1) {
        current.children.push({type: 'file', baseDir, path: f})
      } else {
        const folder: Folder = {type: 'folder', baseDir, path: parts.slice(0, i + 1).join('/'), children: []}
        current.children.push(folder)
        current = folder
      }
    })
  }
  return tree
}
