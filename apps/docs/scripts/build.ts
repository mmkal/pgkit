import * as fs from 'fs'
import * as path from 'path'

const main2 = async () => {
  const projectRoot = path.join(__dirname, '../../..')
  const appDir = path.join(__dirname, '..')
  const pagesDir = path.join(appDir, 'pages')

  const pkgRoute = (name: string) => `/packages/${name}`

  const readReadme = (readmePath: string) => {
    const content = fs.readFileSync(readmePath, 'utf8')
    return content
      .replaceAll('./gifs/', '/gifs/')
      .replaceAll('./images/', '/images/')
      .replaceAll(/https:\/\/github.com\/.*\/tree\/\w+\/packages\/(.+)#readme/g, (...m) => {
        return pkgRoute(m[1] as string)
      })
      .replaceAll(/https:\/\/npmjs.com\/package\/@pgkit\/([\w-]+)/g, (...m) => {
        return pkgRoute(m[1] as string)
      })
      .replaceAll(
        `[![Node CI](https://github.com/mmkal/pgkit/workflows/CI/badge.svg)](https://github.com/mmkal/pgkit/actions?query=workflow%3ACI)`,
        '',
      )
      .replaceAll(
        `[![codecov](https://codecov.io/gh/mmkal/pgkit/branch/main/graph/badge.svg)](https://codecov.io/gh/mmkal/pgkit)`,
        '',
      )
      .replaceAll(`<img src=".`, `<img src="`)
  }

  const getPkg = <N extends string>(name: N) => {
    const readmePath = path.join(projectRoot, 'packages', name, 'readme.md')
    return {
      name,
      path: path.join(projectRoot, 'packages', name),
      readmePath: readmePath,
      readme: readReadme(readmePath),
      packageJsonPath: path.join(projectRoot, 'packages', name, 'package.json'),
    }
  }
  const packages = [
    getPkg('client'), //
    getPkg('migrator'),
    getPkg('admin'),
    getPkg('schemainspect'),
    getPkg('migra'),
  ]

  await fs.promises.mkdir(pagesDir, {recursive: true})

  for (const pkg of packages) {
    await fs.promises.mkdir(path.join(pagesDir, 'packages'), {recursive: true})
    await fs.promises.writeFile(path.join(pagesDir, 'packages', pkg.name + '.md'), pkg.readme)
  }

  const packagesMeta = Object.fromEntries(packages.map(({name}) => [name, name] as const))

  await fs.promises.writeFile(path.join(pagesDir, 'packages/_meta.json'), JSON.stringify(packagesMeta, null, 2))

  await fs.promises.mkdir(path.join(appDir, 'public/images'), {recursive: true})
  await fs.promises.mkdir(path.join(appDir, 'public/gifs'), {recursive: true})
  await fs.promises.copyFile(
    path.join(projectRoot, 'packages/client/images/logo.svg'),
    path.join(appDir, 'public/images/logo.svg'),
  )
  await fs.promises.copyFile(
    path.join(projectRoot, 'packages/admin/gifs/demo.gif'),
    path.join(appDir, 'public/gifs/demo.gif'),
  )
}

const main = async () => {
  const projectRoot = path.join(__dirname, '../../..')
  const appDir = path.join(__dirname, '..')
  const pagesDir = path.join(appDir, 'pages')

  const toRoute = (file: string) => {
    const pkgName = file.split('packages/').at(1)?.split('/').at(0)
    const subpath = file.split(`packages/${pkgName}/`).at(1)

    if (file.toLowerCase() === 'readme.md') return {route: '/'}

    if (!pkgName || !subpath) throw new Error(`Could not find package name/path for file ${file}`)

    const target =
      subpath.toLowerCase() === 'readme.md'
        ? path.join(pagesDir, pkgName) + path.extname(subpath)
        : path.join(pagesDir, pkgName, subpath)
    const route = `${pkgName}/${
      subpath.toLowerCase() === 'readme.md'
        ? '' //
        : subpath.replace('.md', '')
    }`.replace(/\/$/, '')
    return {file, target, pkgName, route}
  }
  type Route = ReturnType<typeof toRoute>
  const fixContent = (content: string, route: Route) => {
    const img = (caption: string, relPath: string) => {
      const existingPath = path.join(projectRoot, path.dirname(route.file), relPath)
      const expectedPath = path.join(path.dirname(route.target), relPath)

      try {
        fs.mkdirSync(path.dirname(expectedPath), {recursive: true})
        fs.copyFileSync(existingPath, expectedPath)
      } catch {
        return
      }

      return `![${caption}](${relPath.replace(/^\./, '')})`
    }

    const routeLinks = [] as Route[]
    content = content
      .replaceAll(/https:\/\/github.com\/.*\/tree\/\w+\/packages\/(.+)#readme/g, (...m) => {
        const r = toRoute(`packages/${m[1] as string}/readme.md`)
        routeLinks.push(r)
        return '/' + r.route
      })
      .replaceAll(/https:\/\/npmjs.com\/package\/@pgkit\/([\w-]+)/g, (...m) => {
        const r = toRoute(`packages/${m[1] as string}/readme.md`)
        return '/' + r.route
      })
      .replaceAll(
        `[![Node CI](https://github.com/mmkal/pgkit/workflows/CI/badge.svg)](https://github.com/mmkal/pgkit/actions?query=workflow%3ACI)`,
        '',
      )
      .replaceAll(
        `[![codecov](https://codecov.io/gh/mmkal/pgkit/branch/main/graph/badge.svg)](https://codecov.io/gh/mmkal/pgkit)`,
        '',
      )
      .replaceAll(`<img src=".`, `<img src="`)
      .replaceAll(/!\[(.*?)]\((.*?)\)/g, (...m) => {
        return img(m[1] as string, m[2] as string)
      })
      .replaceAll(/<img src="(.*?)".*? \/>/g, (...m) => {
        return img('', m[1] as string)
      })

    return {
      content,
      routeLinks,
    }
  }
  const indexContent = await fs.promises.readFile(path.join(projectRoot, 'readme.md'), 'utf8')
  const fixedContent = fixContent(indexContent, toRoute('readme.md'))
  fixedContent.content = fixedContent.content
    .split(/<\/?blockquote>/)
    .filter((_s, i) => i !== 1)
    .join('')
  await fs.promises.mkdir(pagesDir, {recursive: true})
  await fs.promises.writeFile(pagesDir + '/index.md', fixedContent.content)

  for (const r of fixedContent.routeLinks) {
    if (!r.file) continue
    await fs.promises.mkdir(path.dirname(r.target), {recursive: true})

    let content = await fs.promises.readFile(path.join(projectRoot, r.file), 'utf8')
    content = fixContent(content, r).content
    await fs.promises.writeFile(r.target, content)
  }

  const _meta = {
    index: 'Home',
    ...Object.fromEntries(
      fixedContent.routeLinks.map(({route}) => {
        return [route, route]
      }),
    ),
  }
  await fs.promises.writeFile(path.join(pagesDir, '_meta.json'), JSON.stringify(_meta, null, 2))

  await fs.promises.mkdir(path.join(appDir, 'public/images'), {recursive: true})
  await fs.promises.mkdir(path.join(appDir, 'public/gifs'), {recursive: true})
  await fs.promises.copyFile(
    path.join(projectRoot, 'packages/client/images/logo.svg'),
    path.join(appDir, 'public/images/logo.svg'),
  )
  await fs.promises.copyFile(
    path.join(projectRoot, 'packages/admin/gifs/demo.gif'),
    path.join(appDir, 'public/gifs/demo.gif'),
  )
}

void main2()
