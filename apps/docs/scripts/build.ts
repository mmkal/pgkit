import * as fs from 'fs'
import * as path from 'path'

const main2 = async () => {
  const projectRoot = path.join(__dirname, '../../..')
  const appDir = path.join(__dirname, '..')
  const pagesDir = path.join(appDir, 'pages')

  const pkgRoute = (name: string) => `/packages/${name}`

  const processReadme = (readmePath: string) => {
    const content = fs.readFileSync(readmePath, 'utf8')
    const lines = content
      .replaceAll('./gifs/', '/gifs/')
      .replaceAll('./images/', '/images/')
      .replaceAll(/https:\/\/github.com\/.*\/tree\/\w+\/packages\/(.+)#readme/g, (...m) => {
        return pkgRoute(m[1] as string)
      })
      .replaceAll(/https:\/\/npmjs.com\/package\/@pgkit\/([\w-]+)/g, (...m) => {
        return pkgRoute(m[1] as string)
      })
      .replaceAll(`<img src=".`, `<img src="`)
      .split('\n')
      .filter(
        line => !line.includes('img.shields.io/twitter') && !line.includes('[Node CI]') && !line.includes('codecov.io'),
      )

    return lines.join('\n')
  }

  const getPkg = <N extends string>(name: N) => {
    const readmePath = path.join(projectRoot, 'packages', name, 'readme.md')
    return {
      name,
      path: path.join(projectRoot, 'packages', name),
      readmePath: readmePath,
      readme: processReadme(readmePath),
      packageJsonPath: path.join(projectRoot, 'packages', name, 'package.json'),
    }
  }
  const packages = [
    getPkg('client'),
    getPkg('migrator'),
    getPkg('admin'),
    getPkg('typegen'),
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
    path.join(projectRoot, 'packages/admin/gifs/admin-demo.gif'),
    path.join(appDir, 'public/gifs/admin-demo.gif'),
  )
  await fs.promises.copyFile(
    path.join(projectRoot, 'packages/typegen/gifs/typegen-demo.gif'),
    path.join(appDir, 'public/gifs/typegen-demo.gif'),
  )
}

void main2()
