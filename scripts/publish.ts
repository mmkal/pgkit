import {Options, execa} from '@rebundled/execa'
import {Listr, ListrTaskWrapper} from 'listr2'
import * as fs from 'fs'
import * as path from 'path'
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer'
import * as semver from 'semver'
import {inspect} from 'util'
import {sortPackageJson} from 'sort-package-json'

const main = async () => {
  const tasks = new Listr(
    [
      {
        title: 'Building',
        task: async (_ctx, task) => pipeExeca(task, 'pnpm', ['--workspace', 'build']),
      },
      {
        title: 'Get temp directory',
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const list = await execa('pnpm', ['list', '--json', '--depth', '0', '--filter', '.'])
          const pkgName = JSON.parse(list.stdout)[0].name
          ctx.tempDir = path.join('/tmp/npmono', pkgName, Date.now().toString())
          task.output = ctx.tempDir
          fs.mkdirSync(ctx.tempDir, {recursive: true})
        },
      },
      {
        title: 'Collecting packages',
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const list = await execa('pnpm', [
            'list',
            '--json',
            '--recursive',
            '--only-projects',
            '--prod',
            '--filter',
            './packages/*',
          ])

          ctx.packages = JSON.parse(list.stdout)

          const pwdsCommand = await execa('pnpm', ['recursive', 'exec', 'pwd']) // use `pnpm recursive exec` to get the correct topological sort order // https://github.com/pnpm/pnpm/issues/7716
          const pwds = pwdsCommand.stdout
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)

          ctx.packages
            .sort((a, b) => a.name.localeCompare(b.name)) // sort alphabetically first, as a tiebreaker (`.sort` is stable)
            .sort((a, b) => pwds.indexOf(a.path) - pwds.indexOf(b.path)) // then topologically

          ctx.packages.forEach((pkg, i, {length}) => {
            const number = Number(`1${'0'.repeat(length.toString().length + 1)}`) + i
            pkg.folder = path.join(ctx.tempDir, `${number}.${pkg.name.replace('/', '__')}`)
          })
          task.output = ctx.packages.map(pkg => `${pkg.name}`).join('\n')
          return `Found ${ctx.packages.length} packages to publish`
        },
      },
      {
        title: `Writing local packages`,
        task: (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Packing ${pkg.name}`,
              task: async (ctx, task) => {
                const localFolder = path.join(pkg.folder, 'local')
                await pipeExeca(task, 'pnpm', ['pack', '--pack-destination', localFolder], {cwd: pkg.path})

                const tgzFileName = fs.readdirSync(localFolder).at(0)!
                await pipeExeca(task, 'tar', ['-xvzf', tgzFileName], {cwd: localFolder})
              },
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: `Writing registry packages`,
        task: (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Pulling ${pkg.name}`,
              task: async (ctx, task) => {
                const registryFolder = path.join(pkg.folder, 'registry')
                fs.mkdirSync(registryFolder, {recursive: true})
                // note: `npm pack foobar` will actually pull foobar.1-2-3.tgz from the registry. It's not actually doing a "pack" at all. `pnpm pack` does not do the same thing - it packs the local directory
                await pipeExeca(task, 'npm', ['pack', pkg.name], {
                  reject: false,
                  cwd: registryFolder,
                })

                const tgzFileName = fs.readdirSync(registryFolder).at(0)
                if (!tgzFileName) {
                  return
                }

                await pipeExeca(task, 'tar', ['-xvzf', tgzFileName], {cwd: registryFolder})

                const registryPackageJson = loadRegistryPackageJson(pkg)
                if (registryPackageJson) {
                  const registryPackageJsonPath = packageJsonFilepath(pkg, 'registry')
                  // avoid churn on package.json field ordering, which npm seems to mess with
                  fs.writeFileSync(
                    registryPackageJsonPath,
                    sortPackageJson(JSON.stringify(registryPackageJson, null, 2)),
                  )
                }
              },
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: 'Get version strategy',
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const allVersions = [
            ...ctx.packages.map(pkg => pkg.version),
            ...(ctx.packages.map(pkg => loadRegistryPackageJson(pkg)?.version).filter(Boolean) as string[]),
          ]
          const maxVersion = allVersions.sort(semver.compare).at(-1) || '0.0.0'
          if (!maxVersion) throw new Error(`No versions found`)

          let bumpedVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
            type: 'Select',
            message: `Select semver increment for all packages, specify new version, or publish packages independently`,
            hint: `Current latest version across all packageas is ${maxVersion}`,
            choices: [
              ...bumpChoices(maxVersion),
              {
                message: 'Independent (each package will have its own version)',
                value: 'independent',
              },
            ],
          })

          if (bumpedVersion === 'independent') {
            const bumpMethod = await task.prompt(ListrEnquirerPromptAdapter).run<semver.ReleaseType | null>({
              type: 'Select',
              message: 'Select semver increment for each package',
              choices: [
                ...allReleaseTypes.map(type => ({message: type, value: type})),
                {
                  message: 'Ask for each package',
                  value: null,
                },
              ],
            })

            const rawChanges = await gatherPackageChanges(ctx)
            const changes = rawChanges.map(c => {
              fs.mkdirSync(path.join(c.pkg.folder, 'changes'), {recursive: true})
              if (c.changes) {
                const changelog = path.join(c.pkg.folder, 'changes/changelog.md')
                fs.writeFileSync(changelog, c.changes || 'No changes')
                return {...c, changelog}
              }
              return {...c, changelog: null}
            })

            const include = await task.prompt(ListrEnquirerPromptAdapter).run<string[]>({
              type: 'MultiSelect',
              message: 'Select packages',
              hint: '(Press <space> to toggle, <a> to toggle all, <i> to invert selection)',
              initial: changes.flatMap((c, i) => (c.changes ? [i] : [])),
              choices: changes.map(c => ({
                name: `${c.pkg.name} ${c.changes ? `(changes: ${[...c.changeTypes].join('/')})` : '(unchanged)'}`.trim(),
                value: c.pkg.name,
              })),
            })

            ctx.versionStrategy = {
              type: 'independent',
              include,
              bump: bumpMethod,
            }
          } else if (bumpedVersion === 'other') {
            bumpedVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              type: 'Input',
              message: `Enter a custom version (must be greater than ${maxVersion})`,
              validate: input => Boolean(semver.valid(input)) && semver.gt(input, maxVersion || '0.0.0'),
            })
          } else {
            ctx.versionStrategy = {type: 'fixed', version: bumpedVersion}
          }
          task.output = inspect(ctx.versionStrategy)
        },
      },
      {
        title: 'Set target versions',
        rendererOptions: {persistentOutput: true},
        task: (ctx, task) =>
          task.newListr<Ctx>(
            ctx.packages.map(pkg => ({
              title: `Setting target version for ${pkg.name}`,
              task: async (ctx, task) => {
                if (ctx.versionStrategy.type === 'fixed') {
                  pkg.targetVersion = ctx.versionStrategy.version
                } else {
                  const currentVersion = [loadRegistryPackageJson(pkg)?.version, pkg.version]
                    .sort(semver.compare)
                    .at(-1)
                  let bumpedVersion = ctx.versionStrategy.bump
                    ? semver.inc(currentVersion, ctx.versionStrategy.bump)
                    : null
                  bumpedVersion ||= await task.prompt(ListrEnquirerPromptAdapter).run<string>({
                    type: 'Select',
                    message: `Select semver increment for ${pkg.name} or specify new version (current latest is ${currentVersion})`,
                    choices: bumpChoices(currentVersion),
                  })
                  if (bumpedVersion === 'other') {
                    bumpedVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
                      type: 'Input',
                      message: `Enter a custom version (must be greater than ${currentVersion})`,
                      validate: input => Boolean(semver.valid(input)) && semver.gt(input, currentVersion),
                    })
                  }

                  if (!semver.valid(bumpedVersion)) {
                    throw new Error(`Invalid version for ${pkg.name}: ${bumpedVersion}`)
                  }

                  pkg.targetVersion = bumpedVersion
                }
              },
            })),
          ),
      },
      {
        title: `Modify local packages`,
        task: (ctx, task) => {
          return task.newListr<Ctx>(
            ctx.packages.map(pkg => ({
              title: `Modify ${pkg.name}`,
              enabled: () => !pkg.private,
              task: async (ctx, task) => {
                const sha = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'], {
                  cwd: pkg.path,
                })
                const packageJson = loadLocalPackageJson(pkg)
                packageJson.version = pkg.targetVersion
                packageJson.git = {
                  ...(packageJson.git as {}),
                  sha: sha.stdout,
                }

                Object.entries(packageJson.dependencies || {}).forEach(([name, version]) => {
                  const found = ctx.packages.find(other => {
                    return other.name === name && other.version === version
                  })
                  if (found) {
                    packageJson.dependencies![name] = found.targetVersion || found.version
                  }
                })

                fs.writeFileSync(
                  packageJsonFilepath(pkg, 'local'),
                  sortPackageJson(JSON.stringify(packageJson, null, 2)),
                )
              },
            })),
          )
        },
      },
      {
        title: 'Diff packages',
        task: diffPackagesTask,
      },
      {
        title: 'Publish packages',
        skip: () => !process.argv.includes('--publish'),
        task: async (ctx, task) => {
          const otpArgs = process.argv.filter((a, i, arr) => a.startsWith('--otp') || arr[i - 1] === '--otp')
          if (otpArgs.length === 0) {
            const otp = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              message: 'Enter npm OTP (press enter to try publishing without MFA)',
              type: 'Input',
              validate: input => input === '' || /^[0-9]{6}$/.test(input),
            })
            if (otp) {
              otpArgs.push('--otp', otp)
            }
          }
          if (otpArgs.length === 0) {
            task.output = 'No OTP provided - publish will likely error unless you have disabled MFA.'
          }
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Publish ${pkg.name}`,
              enabled: () => !pkg.private,
              task: async (ctx, task) => {
                await pipeExeca(task, 'pnpm', ['publish', '--access', 'public', ...otpArgs], {
                  cwd: path.dirname(packageJsonFilepath(pkg, 'local')),
                })
              },
            })),
          )
        },
      },
    ],
    {ctx: {} as Ctx},
  )

  const packageJsonFilepath = (pkg: PkgMeta, type: 'local' | 'registry') =>
    path.join(pkg.folder, type, 'package', 'package.json')
  const loadLocalPackageJson = (pkg: PkgMeta) => {
    const filepath = packageJsonFilepath(pkg, 'local')
    return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
  }
  const loadRegistryPackageJson = (pkg: PkgMeta) => {
    const filepath = packageJsonFilepath(pkg, 'registry')
    if (!fs.existsSync(filepath)) return null
    return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
  }

  const bumpChoices = (oldVersion: string) => {
    const releaseTypes: semver.ReleaseType[] = allReleaseTypes.filter(r => r !== 'prerelease')
    semver.prerelease(oldVersion) ? releaseTypes.unshift('prerelease') : releaseTypes.push('prerelease')

    return [
      ...releaseTypes.map(type => {
        const result = semver.inc(oldVersion, type)!
        return {
          message: `${type} ${result}`,
          value: result,
        }
      }),
      {
        message: 'Other (please specify)',
        value: 'other',
      },
    ]
  }

  async function getPackageRevList(pkg: Pkg) {
    const registryRef = loadRegistryPackageJson(pkg)?.git?.sha
    const {stdout: localRef} = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'])
    const {stdout} = await execa(
      'git',
      ['rev-list', '--ancestry-path', `${registryRef}..${localRef}`, '--format=oneline', '--abbrev-commit', '--', '.'],
      {cwd: pkg.path},
    )
    return stdout
  }

  async function gatherPackageChanges(ctx: Ctx) {
    const withSourceChanges = await Promise.all(
      ctx.packages.map(async pkg => {
        const changes = await getPackageRevList(pkg)
        return {
          pkg,
          changeTypes: new Set(changes ? ['source'] : []),
          /** Summary of changes in markdown format. `null` if there are no changes to the package or any of its workspace dependencies. */
          changes: changes ? toBullets(changes) : null,
        }
      }),
    )
    const pkgDict = Object.fromEntries(withSourceChanges.map(c => [c.pkg.name, c]))
    let changed: boolean
    let loops = 0
    do {
      if (loops++ > 1000) {
        throw new Error(`Too many loops, maybe there's a circular dependency?`, {cause: withSourceChanges})
      }
      changed = false
      for (const c of withSourceChanges) {
        for (const dep of Object.keys(c.pkg.dependencies || {})) {
          const depPkg = pkgDict[dep]
          if (!depPkg) continue
          if (depPkg.changes) {
            const newMessage = [
              `<details>`,
              `<summary>Dependency ${depPkg.pkg.name} changed</summary>`,
              '',
              '<blockquote>',
              depPkg.changes,
              '</blockquote>',
              '</details>',
            ].join('\n')
            if (c.changes?.includes(newMessage)) continue
            c.changeTypes.add('dependencies')
            c.changes = [c.changes, newMessage].filter(Boolean).join('\n\n')
            changed = true
          }
        }
      }
    } while (changed)

    return withSourceChanges
  }

  async function diffPackagesTask(ctx: Ctx, task: ListrTaskWrapper<Ctx, any, any>) {
    return task.newListr(
      ctx.packages.map(pkg => ({
        title: `Diff ${pkg.name}`,
        task: async (ctx, task) => {
          const localPath = path.dirname(packageJsonFilepath(pkg, 'local'))
          const registryPath = path.dirname(packageJsonFilepath(pkg, 'registry'))

          const changesFolder = path.join(pkg.folder, 'changes')
          await fs.promises.mkdir(changesFolder, {recursive: true})

          const localPkg = loadLocalPackageJson(pkg)
          const registryPkg = loadRegistryPackageJson(pkg)

          if (!registryPkg) {
            task.output = 'No published version'
            return
          }

          await execa('git', ['diff', '--no-index', registryPath, localPath], {
            reject: false, // git diff --no-index implies --exit-code. So when there are changes it exits with 1
            stdout: {
              file: path.join(changesFolder, 'package.diff'),
            },
          })

          let localRef = localPkg.git?.sha
          let registryRef = registryPkg.git?.sha

          if (!localRef) {
            throw new Error(`No local ref found for ${pkg.name}`)
          }

          if (localRef && registryRef) {
            await execa('git', ['diff', registryRef, localRef, '--', '.'], {
              cwd: pkg.path,
              stdout: {
                file: path.join(changesFolder, 'source.diff'),
              },
            })
          }
        },
      })),
      {concurrent: true},
    )
  }

  await tasks.run()
}

const toBullets = (s: string) => {
  const lines = s.split('\n')
  return lines.map(s => `- ${s}`).join('\n')
}

const allReleaseTypes: readonly semver.ReleaseType[] = [
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
]

type Pkg = PkgMeta & {
  name: string
  version: string
  path: string
  private: boolean
  dependencies: Record<
    string,
    {
      from: string
      version: string
      path: string
    }
  >
}

type Ctx = {
  tempDir: string
  versionStrategy:
    | {type: 'fixed'; version: string}
    | {
        type: 'independent'
        include: string[]
        bump: semver.ReleaseType | null
      }
  publishTag: string
  packages: Array<Pkg>
}

type PackageJson = import('type-fest').PackageJson & {
  /**
   * not an official package.json field, but there is a library that does something similar to this: https://github.com/Metnew/git-hash-package
   * having git.sha point to a commit hash seems pretty useful to me, even if it's not standard.
   * tagging versions in git is still a good best practice but there are many different ways, e.g. `1.2.3` vs `v1.2.3` vs `mypgk@1.2.3` vs `mypkg@v1.2.3`
   * plus, that's only useful in going from git -> npm, not npm -> git.
   */
  git?: {sha?: string}
}

type PkgMeta = {
  folder: string
  lastPublished: PackageJson | null
  targetVersion: string | null
}

const pipeExeca = async (task: ListrTaskWrapper<any, any, any>, file: string, args: string[], options?: Options) => {
  const cmd = execa(file, args, options)
  cmd.stdout.pipe(task.stdout())
  return cmd
}

const maxBy = <T>(list: T[], fn: (x: T) => number) => {
  const result = list.reduce<{item: T; value: number} | null>((max, item) => {
    const value = fn(item)
    return !max || value > max.value ? {item, value} : max
  }, null)
  return result?.item
}

if (require.main === module) {
  main()
}
