import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer'
import {Options, execa} from '@rebundled/execa'
import findUp from 'find-up'
import * as fs from 'fs'
import {Listr, ListrTaskWrapper} from 'listr2'
import * as path from 'path'
import * as semver from 'semver'
import {z} from 'trpc-cli'
import {inspect} from 'util'

const VERSION_ZERO = '0.0.0'

export const PublishInput = z.object({
  publish: z.boolean().optional(),
  otp: z.string().optional(),
})
export type PublishInput = z.infer<typeof PublishInput>

export const publish = async (input: PublishInput) => {
  const {sortPackageJson} = await import('sort-package-json')
  const monorepoRoot = path.dirname(findUpOrThrow('pnpm-workspace.yaml'))
  process.chdir(monorepoRoot)
  const tasks = new Listr(
    [
      {
        title: 'Building',
        task: async (_ctx, task) => pipeExeca(task, 'pnpm', ['-w', 'build']),
      },
      {
        title: 'Get temp directory',
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const list = await execa('pnpm', ['list', '--json', '--depth', '0', '--filter', '.'])
          const pkgName = JSON.parse(list.stdout)?.[0]?.name as string | undefined
          if (!pkgName) throw new Error(`Couldn't get package name from pnpm list output: ${list.stdout}`)
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

          ctx.packages = JSON.parse(list.stdout) as never
          ctx.packages = ctx.packages.filter(pkg => !pkg.private)

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
              task: async (_ctx, subtask) => {
                const localFolder = path.join(pkg.folder, 'local')
                await pipeExeca(subtask, 'pnpm', ['pack', '--pack-destination', localFolder], {cwd: pkg.path})

                const tgzFileName = fs.readdirSync(localFolder).at(0)!
                await pipeExeca(subtask, 'tar', ['-xvzf', tgzFileName], {cwd: localFolder})
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
              task: async (_ctx, subtask) => {
                const registryFolder = path.join(pkg.folder, 'registry')
                fs.mkdirSync(registryFolder, {recursive: true})
                // note: `npm pack foobar` will actually pull foobar.1-2-3.tgz from the registry. It's not actually doing a "pack" at all. `pnpm pack` does not do the same thing - it packs the local directory
                await pipeExeca(subtask, 'npm', ['pack', pkg.name], {
                  reject: false,
                  cwd: registryFolder,
                })

                const tgzFileName = fs.readdirSync(registryFolder).at(0)
                if (!tgzFileName) {
                  return
                }

                await pipeExeca(subtask, 'tar', ['-xvzf', tgzFileName], {cwd: registryFolder})

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
          const maxVersion = allVersions.sort(semver.compare).at(-1) || VERSION_ZERO
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
              validate: v =>
                typeof v === 'string' && Boolean(semver.valid(v)) && semver.gt(v, maxVersion || VERSION_ZERO),
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

            const currentVersion = [loadRegistryPackageJson(pkg)?.version, pkg.version]
              .sort((a, b) => semver.compare(a || VERSION_ZERO, b || VERSION_ZERO))
              .at(-1)

            if (ctx.versionStrategy.bump) {
              pkg.targetVersion = semver.inc(currentVersion || VERSION_ZERO, ctx.versionStrategy.bump)
              continue
            }

            const choices = bumpChoices(currentVersion || VERSION_ZERO)
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
                validate: v =>
                  typeof v === 'string' && Boolean(semver.valid(v)) && semver.gt(v, currentVersion || VERSION_ZERO),
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
                if (!pkg) {
                  problems.push(`Package ${name} not found`)
                  continue
                }
                const dependencies = workspaceDependencies(pkg, ctx)
                const missing = dependencies.filter(d => !names.includes(d.name))

                problems.push(...missing.map(m => `Package ${name} depends on ${m.name}`))
              }

              if (problems.length > 0) return `Can't publish that selection of packages:\n` + problems.join('\n')

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
              task: async (_ctx, _subtask) => {
                if (!pkg.targetVersion || !semver.valid(pkg.targetVersion)) {
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

                packageJson.dependencies = await getBumpedDependencies(ctx, {pkg}).then(r => r.dependencies)

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
        title: ['Publish packages', !input.publish && '(dry run)'].filter(Boolean).join(' '),
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          const shouldActuallyPublish = input.publish
          let otp = input.otp
          if (shouldActuallyPublish) {
            otp ||= await task.prompt(ListrEnquirerPromptAdapter).run<string>({
              message: 'Enter npm OTP (press enter to try publishing without MFA)',
              type: 'Input',
              validate: v => v === '' || (typeof v === 'string' && /^\d{6}$/.test(v)),
            })
            if (otp.length === 0) {
              task.output = 'No OTP provided - publish will likely error unless you have disabled MFA.'
            }
          }
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Publish ${pkg.name} -> ${pkg.targetVersion}`,
              skip: () => !shouldActuallyPublish || pkg.targetVersion === loadRegistryPackageJson(pkg)?.version,
              task: async (_ctx, subtask) => {
                await pipeExeca(subtask, 'pnpm', ['publish', '--access', 'public', ...(otp ? ['--otp', otp] : [])], {
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

  await tasks.run()
}

const packageJsonFilepath = (pkg: PkgMeta, type: 'local' | 'registry') =>
  path.join(pkg.folder, type, 'package', 'package.json')

const loadLocalPackageJson = (pkg: PkgMeta) => {
  const filepath = packageJsonFilepath(pkg, 'local')
  return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
}
const loadRegistryPackageJson = (pkg: PkgMeta) => {
  const filepath = packageJsonFilepath(pkg, 'registry')
  if (!fs.existsSync(path.join(pkg.folder, 'registry'))) {
    // it's ok for the package to not exist, maybe this is a new package. But the folder should exist so we know that there's been an attempt to pull it.
    throw new Error(
      `Registry package.json folder for ${filepath} doesn't exist yet. Has the "Pulling \${pkg.name}" step run yet?`,
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

/**
 * For a particular package, get the `dependencies` object with any necessary version bumps.
 * Requires a `pkg`, and an `expectVersion` function
 */
async function getBumpedDependencies(ctx: Ctx, params: {pkg: Pkg}) {
  const packageJson = loadLocalPackageJson(params.pkg)
  const newDependencies = {...packageJson.dependencies}
  const updated: Record<string, string> = {}
  for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
    const found = ctx.packages
      .filter(other => other.name === name)
      .flatMap(other => {
        const prefix = ['', '^', '~'].find(p => version === p + other.version)
        return prefix ? [{pkg: other, prefix}] : []
      })
      .find(Boolean)

    if (!found) {
      continue
    }

    const registryPackageJson = loadRegistryPackageJson(found.pkg)
    const registryPackageDependencyVersion = registryPackageJson?.dependencies?.[name]
    let expected = found.pkg.targetVersion
    if (!expected) {
      // ok, looks like we're not publishing the dependency. That's fine, as long as there's an existing published version.
      expected = registryPackageJson?.version || null
    }
    if (!expected) {
      throw new Error(
        `Package ${params.pkg.name} depends on ${found.pkg.name} but ${found.pkg.name} is not published, and no target version was set for publishing now. Did you opt to skip publishing ${found.pkg.name}? If so, please re-run and make sure to publish ${found.pkg.name}. You can't publish ${params.pkg.name} until you do that.`,
      )
    }

    // todo: figure out if this shortcut can be actually safe - it isn't right now because the local version doesn't necessarily match the registry version
    // and we should probably be solving this by just filtering out packages that don't need to be published rather than trying to shortcut here
    // if (registryPackageDependencyVersion && semver.satisfies(expected, registryPackageDependencyVersion)) {
    //   // if the expected version is already satisfied by the registry version, then we don't need to bump it
    //   continue
    // }

    const prefix = found.prefix || registryPackageDependencyVersion?.match(/^[^~]/)?.[0] || ''

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
  const commitBullets = stdout
    .split('\n')
    .filter(Boolean)
    .map(line => `- ${line}`)
  const sections = [
    commitBullets.length > 0 && '<h3>Commits</h3>\n',
    ...commitBullets,
    uncommitedChanges.trim() && 'Uncommitted changes:\n' + uncommitedChanges,
  ]
  return (
    sections.filter(Boolean).join('\n').trim() || `No ${pkg.name} changes since last publish (${fromRef}..${localRef})`
  )
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

  const bumpedDeps = await getBumpedDependencies(ctx, {pkg})

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
        depChanges
          .split('\n')
          .filter(line => !/^<!-- data-change-type=".*" -->$/.test(line))
          .map(line => (line.trim() ? `${line}` : line))
          .join('\n') || `${bumpedDeps.updated[dep]} (Version bump)`,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function diffPackagesTask(ctx: Ctx, task: ListrTaskWrapper<Ctx, any, any>) {
  return task.newListr(
    ctx.packages.map(pkg => ({
      title: `Diff ${pkg.name}`,
      task: async (_ctx, subtask) => {
        const localPath = path.dirname(packageJsonFilepath(pkg, 'local'))
        const registryPath = path.dirname(packageJsonFilepath(pkg, 'registry'))

        const changesFolder = path.join(pkg.folder, 'changes')
        await fs.promises.mkdir(changesFolder, {recursive: true})

        const localPkg = loadLocalPackageJson(pkg)
        const registryPkg = loadRegistryPackageJson(pkg)

        if (!registryPkg) {
          subtask.output = 'No published version'
          return
        }

        await execa('git', ['diff', '--no-index', registryPath, localPath], {
          reject: false, // git diff --no-index implies --exit-code. So when there are changes it exits with 1
          stdout: {
            file: path.join(changesFolder, 'package.diff'),
          },
        })

        const localRef = localPkg.git?.sha
        const registryRef = registryPkg.git?.sha

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipeExeca = async (task: ListrTaskWrapper<any, any, any>, file: string, args: string[], options?: Options) => {
  const cmd = execa(file, args, options)
  cmd.stdout.pipe(task.stdout())
  return cmd
}

const findUpOrThrow = (file: string, options?: Parameters<typeof findUp.sync>[1]) => {
  const result = findUp.sync(file, options)
  if (!result) {
    throw new Error(`Could not find ${file}`)
  }
  return result
}
