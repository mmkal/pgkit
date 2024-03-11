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
            const bumpMethod = await task.prompt(ListrEnquirerPromptAdapter).run<semver.ReleaseType | 'ask'>({
              type: 'Select',
              message: 'Select semver increment for each package',
              choices: [
                ...allReleaseTypes.map(type => ({message: type, value: type})),
                {
                  message: 'Ask for each package',
                  value: 'ask',
                },
              ],
            })

            ctx.versionStrategy = {
              type: 'independent',
              bump: bumpMethod === 'ask' ? null : bumpMethod,
            }
          } else if (bumpedVersion === 'other') {
            bumpedVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              type: 'Input',
              message: `Enter a custom version (must be greater than ${maxVersion})`,
              validate: input => Boolean(semver.valid(input)) && semver.gt(input, maxVersion || '0.0.0'),
            })
          } else {
            ctx.versionStrategy = {
              type: 'fixed',
              version: bumpedVersion,
            }
          }
          task.output = inspect(ctx.versionStrategy)
        },
      },
      {
        title: 'Set target versions',
        task: async function setTargetVersions(ctx, task) {
          for (const pkg of ctx.packages) {
            const changelog = await getOrCreateChangelog(ctx, pkg)
            if (ctx.versionStrategy.type === 'fixed') {
              pkg.targetVersion = ctx.versionStrategy.version
              continue
            }

            const currentVersion = [loadRegistryPackageJson(pkg)?.version, pkg.version].sort(semver.compare).at(-1)

            if (ctx.versionStrategy.bump) {
              pkg.targetVersion = semver.inc(currentVersion, ctx.versionStrategy.bump)
              continue
            }

            const choices = bumpChoices(currentVersion)
            if (changelog) {
              choices.push({message: `Do not publish (note: package is changed)`, value: 'none'})
            } else {
              choices.unshift({message: `Do not publish (package is unchanged)`, value: 'none'})
            }

            let newVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              type: 'Select',
              message: `Select semver increment for ${pkg.name} or specify new version (current latest is ${currentVersion})`,
              choices,
            })
            if (newVersion === 'none') {
              continue
            }
            if (newVersion === 'other') {
              newVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
                type: 'Input',
                message: `Enter a custom version (must be greater than ${currentVersion})`,
                validate: input => Boolean(semver.valid(input)) && semver.gt(input, currentVersion),
              })
            }

            pkg.targetVersion = newVersion
          }
          const packagesWithChanges = ctx.packages.map(pkg => ({
            pkg,
            changes: fs.readFileSync(changelogFilepath(pkg)).toString(),
          }))

          if (ctx.versionStrategy.type === 'fixed') return

          if (ctx.versionStrategy.type === 'independent' && !ctx.versionStrategy.bump) return

          const include = await task.prompt(ListrEnquirerPromptAdapter).run<string[]>({
            type: 'MultiSelect',
            message: 'Select packages',
            hint: 'Press <space> to toggle, <a> to toggle all, <i> to invert selection',
            initial: packagesWithChanges.flatMap((c, i) => (c.changes ? [i] : [])),
            choices: packagesWithChanges.map(c => {
              const changeTypes = [...new Set([...c.changes.matchAll(/data-change-type="(\w+)"/g)].map(m => m[1]))]
              return {
                name: `${c.pkg.name} ${c.changes ? `(changes: ${changeTypes.join(', ')})` : '(unchanged)'}`.trim(),
                value: c.pkg.name,
              }
            }),
            validate: (values: string[]) => {
              const names = values.map(v => v.split(' ')[0])
              const problems: string[] = []
              for (const name of names) {
                const pkg = ctx.packages.find(p => p.name === name)
                const dependencies = workspaceDependencies(pkg, ctx)
                const missing = dependencies.filter(d => !names.includes(d.name))

                problems.push(...missing.map(m => `Package ${name} depends on ${m.name}`))
              }

              if (problems.length) return problems.join('\n')

              return true
            },
          })

          const includeSet = new Set(include.map(inc => inc.split(' ')[0]))

          ctx.packages = ctx.packages.filter(pkg => includeSet.has(pkg.name))
        },
      },
      {
        title: `Modify local packages`,
        task: (ctx, task) => {
          return task.newListr<Ctx>(
            ctx.packages.map(pkg => ({
              title: `Modify ${pkg.name}`,
              task: async (ctx, task) => {
                if (!semver.valid(pkg.targetVersion)) {
                  throw new Error(`Invalid version for ${pkg.name}: ${pkg.targetVersion}`)
                }

                const sha = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'], {
                  cwd: pkg.path,
                })
                const packageJson = loadLocalPackageJson(pkg)

                packageJson.version = pkg.targetVersion
                packageJson.git = {
                  ...(packageJson.git as {}),
                  sha: sha.stdout,
                }

                packageJson.dependencies = await getBumpedDependencies(ctx, {
                  pkg,
                  expectedVersion: async dep => {
                    if (!dep.pkg.targetVersion) {
                      throw new Error(`Can't set ${dep.pkg.name} dependency for ${pkg.name} - no target version set`)
                    }
                    return dep.pkg.targetVersion
                  },
                }).then(r => r.dependencies)

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
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const shouldActuallyPublish = process.argv.includes('--publish')
          const otpArgs = process.argv.filter((a, i, arr) => a.startsWith('--otp') || arr[i - 1] === '--otp')
          if (shouldActuallyPublish && otpArgs.length === 0) {
            const otp = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              message: 'Enter npm OTP (press enter to try publishing without MFA)',
              type: 'Input',
              validate: input => input === '' || /^[0-9]{6}$/.test(input),
            })
            if (otp) {
              otpArgs.push('--otp', otp)
            }
            if (otpArgs.length === 0) {
              task.output = 'No OTP provided - publish will likely error unless you have disabled MFA.'
            }
          }
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Publish ${pkg.name} -> ${pkg.targetVersion}`,
              skip: () => !shouldActuallyPublish || pkg.targetVersion === loadRegistryPackageJson(pkg)?.version,
              task: async (ctx, task) => {
                await pipeExeca(task, 'pnpm', ['publish', '--access', 'public', ...otpArgs], {
                  cwd: path.dirname(packageJsonFilepath(pkg, 'local')),
                })
              },
            })),
            {rendererOptions: {collapseSubtasks: false}},
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
    if (!fs.existsSync(path.dirname(filepath))) {
      // it's ok for the package to not exist, maybe this is a new package. But the folder should exist so we know that there's been an attempt to pull it.
      throw new Error(
        `Registry package.json folder for ${filepath} doesn't exist yet. Has the "Pull registry packages" step run yet?`,
      )
    }

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

  /** Pessimistic comparison ref. Tries to use the registry package.json's `git.sha` property, and uses the first ever commit to the package folder if that can't be found. */
  async function getPackageLastPublishRef(pkg: Pkg) {
    const registryRef = loadRegistryPackageJson(pkg)?.git?.sha
    if (registryRef) return registryRef

    const {stdout: firstRef} = await execa('git', ['log', '--reverse', '-n', '1', '--pretty=format:%h', '--', '.'], {
      cwd: pkg.path,
    })
    return firstRef
  }

  type GetExpectedVersion = (params: {pkg: Pkg; packageJson: PackageJson}) => Promise<string>

  async function getBumpedDependencies(ctx: Ctx, params: {pkg: Pkg; expectedVersion: GetExpectedVersion}) {
    const packageJson = loadLocalPackageJson(params.pkg)
    const newDependencies = {...packageJson.dependencies}
    const updated: Record<string, string> = {}
    for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
      const found = ctx.packages
        .flatMap(other => {
          const prefix = ['', '^', '~'].find(prefix => other.name === name && version === prefix + other.version)
          return prefix ? [{pkg: other, prefix}] : []
        })
        .find(Boolean)

      if (!found) {
        continue
      }

      const registryPackageJson = loadRegistryPackageJson(params.pkg)
      const registryPackageDependencyVersion = registryPackageJson.dependencies?.[name]
      const expected = await params.expectedVersion({pkg: found.pkg, packageJson: registryPackageJson})

      if (registryPackageDependencyVersion && semver.satisfies(expected, registryPackageDependencyVersion)) {
        // if the expected version is already satisfied by the registry version, then we don't need to bump it
        continue
      }
      const prefix = found.prefix || registryPackageDependencyVersion?.match(/^[~^]/)?.[0] || ''

      newDependencies[name] = prefix + expected
      updated[name] = `${registryPackageDependencyVersion} -> ${newDependencies[name]}`
    }

    if (Object.keys(updated).length === 0) {
      // keep reference equality, avoid `undefined` -> `{}`
      return {updated, dependencies: packageJson.dependencies}
    }

    return {updated, dependencies: newDependencies}
  }

  async function getPackageRevList(pkg: Pkg) {
    const fromRef = await getPackageLastPublishRef(pkg)

    const {stdout: localRef} = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'])
    const {stdout} = await execa(
      'git',
      ['rev-list', '--ancestry-path', `${fromRef}..${localRef}`, '--format=oneline', '--abbrev-commit', '--', '.'],
      {cwd: pkg.path},
    )
    const {stdout: uncommitedChanges} = await execa('git', ['status', '--porcelain', '--', '.'], {
      cwd: pkg.path,
    })
    const sections = [stdout, uncommitedChanges.trim() && 'Uncommitted changes:\n' + uncommitedChanges]
    return sections.filter(Boolean).join('\n')
  }

  const changelogFilepath = (pkg: Pkg) => path.join(pkg.folder, 'changes/changelog.md')

  const workspaceDependencies = (pkg: Pkg, ctx: Ctx, depth = 0): Pkg[] =>
    Object.keys(pkg.dependencies || {}).flatMap(name => {
      const dep = ctx.packages.find(p => p.name === name)
      return dep ? [dep, ...(depth > 0 ? workspaceDependencies(dep, ctx, depth - 1) : [])] : []
    })

  /**
   * Creates a changelog.md and returns its content. If one already exists, its content is returned without being regenerated.
   * Note: this recursively calls itself on finding workspace dependencies so will cause stack overflows if there are dependency loops.
   * It's important that this is called in toplogical order, so that dependency changelogs are accurate.
   */
  async function getOrCreateChangelog(ctx: Ctx, pkg: Pkg): Promise<string> {
    const changelogFile = changelogFilepath(pkg)
    if (fs.existsSync(changelogFile)) {
      return fs.readFileSync(changelogFile).toString()
    }

    const sourceChanges = await getPackageRevList(pkg)

    const changes = sourceChanges
      ? [`<!-- data-change-type="source" -->\n${sourceChanges}`] // break
      : []

    const bumpedDeps = await getBumpedDependencies(ctx, {
      pkg,
      expectedVersion: async dep => dep.pkg.targetVersion || dep.packageJson.version,
    })

    for (const depPkg of workspaceDependencies(pkg, ctx)) {
      const dep = depPkg.name
      if (bumpedDeps.updated[dep]) {
        const depChanges = await getOrCreateChangelog(ctx, depPkg)
        const newMessage = [
          '<!-- data-change-type="dependencies" -->',
          `<details>`,
          `<summary>Dependency ${depPkg.name} changed (${bumpedDeps.updated[dep]})</summary>`,
          '',
          '<blockquote>',
          ...(depChanges
            .split('\n')
            .filter(line => !line.match(/^<!-- data-change-type=".*" -->$/))
            .map(line => (line.trim() ? `${line}` : line)) || bumpedDeps.updated[dep]),
          '</blockquote>',
          '</details>',
        ].join('\n')
        changes.push(newMessage)
      }
    }

    const changelogContent = changes.filter(Boolean).join('\n\n')
    fs.mkdirSync(path.dirname(changelogFile), {recursive: true})
    fs.writeFileSync(changelogFile, changelogContent)
    return changelogContent
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
  return lines.map(s => (s.trim() ? `- ${s}` : s)).join('\n')
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
    | Readonly<{type: 'fixed'; version: string}>
    | Readonly<{type: 'independent'; bump: semver.ReleaseType | null}>
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

if (require.main === module) {
  main()
}
