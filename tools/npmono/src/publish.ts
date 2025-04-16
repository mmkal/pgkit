import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer'
import {Options, execa} from '@rebundled/execa'
import findUp from 'find-up'
import * as fs from 'fs'
import {Listr, ListrTask, ListrTaskWrapper} from 'listr2'
import * as path from 'path'
import * as semver from 'semver'
import {z} from 'trpc-cli'
import {inspect} from 'util'

const VERSION_ZERO = '0.0.0'

/** "left" folder i.e. base for comparison - usually from the registry */
const LHS_FOLDER = 'left'
/** "right" folder i.e. head for publishing - usually build from local source */
const RHS_FOLDER = 'right'

export const PublishInput = z
  .object({
    publish: z
      .boolean()
      .describe(
        'actually publish packages - if not provided the tool will run in dry-run mode and create a directory containing the packages to be published.',
      )
      .optional(),
    otp: z.string().describe('npm otp - needed with --publish. If not provided you will be prompted for it').optional(),
    bump: z
      .enum(['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease', 'other', 'independent'])
      .describe('semver "bump" strategy - if not provided you will be prompted for it. Do not use with --version.')
      .optional(),
    version: z.string().describe('specify an exact version to bump to. Do not use with --bump.').optional(),
    skipRegistryPull: z
      .boolean()
      .optional()
      .describe('skip pulling registry packages. Note: if publishing, the full history will appear in changelogs'),
  })
  .refine(obj => !(obj.bump && obj.version), {message: `Don't use --bump and --version together`})
export type PublishInput = z.infer<typeof PublishInput>

export const setupContextTasks: ListrTask<Ctx>[] = [
  {
    title: 'Set working directory',
    task: async () => process.chdir(getWorkspaceRoot()),
  },
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
      task.output = ctx.packages.map(pkg => `${pkg.name}`).join(', ')
      return `Found ${ctx.packages.length} packages to publish`
    },
  },
  {
    title: 'Getting published versions',
    task: (ctx, task) => {
      return task.newListr(
        ctx.packages.map(pkg => ({
          title: `Getting published versions for ${pkg.name}`,
          task: async _ctx => {
            fs.mkdirSync(path.join(pkg.folder, LHS_FOLDER), {recursive: true})
            pkg.publishedVersions = await getRegistryVersions(pkg)
          },
        })),
        {concurrent: true},
      )
    },
  },
]

const getRegistryVersions = async (pkg: Pick<Pkg, 'name'>) => {
  const registryVersionsResult = await execa('npm', ['view', pkg.name, 'versions', '--json'], {reject: false})
  const StdoutShape = z.union([
    z.array(z.string()).nonempty(), // success
    z.object({error: z.object({code: z.literal('E404')})}), // not found - package doesn't exist (yet!). this is ok. other errors are not.
  ])
  const registryVersionsStdout = StdoutShape.parse(JSON.parse(registryVersionsResult.stdout))
  return Array.isArray(registryVersionsStdout) ? registryVersionsStdout : []
}

export const publish = async (input: PublishInput) => {
  const {sortPackageJson} = await import('sort-package-json')
  const tasks = new Listr(
    [
      ...setupContextTasks,
      {
        title: `Writing local packages`,
        task: (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Packing ${pkg.name}`,
              task: async (_ctx, subtask) => {
                const toBePublishedFolderPath = path.join(pkg.folder, RHS_FOLDER)
                await pipeExeca(subtask, 'pnpm', ['pack', '--pack-destination', toBePublishedFolderPath], {
                  cwd: pkg.path,
                })

                const tgzFileName = () => fs.readdirSync(toBePublishedFolderPath).at(0)!
                await fs.promises.rename(
                  path.join(toBePublishedFolderPath, tgzFileName()),
                  path.join(toBePublishedFolderPath, `${pkg.name.replace('@', '').replace('/', '-')}-local.tgz`),
                )
                await pipeExeca(subtask, 'tar', ['-xvzf', tgzFileName()], {cwd: toBePublishedFolderPath})
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
            ...ctx.packages.flatMap(pkg => pkg.publishedVersions.slice()),
          ]
          const maxVersion = allVersions.sort(semver.compare).at(-1) || VERSION_ZERO
          if (!maxVersion) throw new Error(`No versions found`)

          let bumpedVersion: string
          if (input.bump) {
            bumpedVersion = bumpChoices(maxVersion).find(c => c.type === input.bump)?.value || input.bump
          } else if (input.version) {
            bumpedVersion = input.version
          }

          bumpedVersion ||= await task.prompt(ListrEnquirerPromptAdapter).run<string>({
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
          } else {
            if (bumpedVersion === 'other') {
              bumpedVersion = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
                type: 'Input',
                message: `Enter a custom version (must be greater than ${maxVersion})`,
                validate: (v: unknown) => getBumpedVersionValidation(maxVersion, v),
              })
            }

            ensureValidBumpedVersion(maxVersion, bumpedVersion)

            ctx.versionStrategy = {
              type: 'fixed',
              version: bumpedVersion,
            }
          }
          task.output = inspect(ctx.versionStrategy)
        },
      },
      {
        title: `Pulling registry packages`,
        rendererOptions: {persistentOutput: true},
        skip: input.skipRegistryPull,
        task: (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Pulling ${pkg.name}`,
              rendererOptions: {persistentOutput: true},
              task: async (_ctx, subtask) => {
                const registryVersions = pkg.publishedVersions
                const publishedAlreadyFolder = path.join(pkg.folder, LHS_FOLDER)
                const publishedVersionForComparison = registryVersions
                  .slice()
                  .reverse()
                  .find(
                    v =>
                      ctx.versionStrategy.type === 'independent' || // independent mode: compare to prerelease versions
                      ctx.versionStrategy.version.includes('-') || // fixed mode prerelease version wanted: compare to prerelease versions
                      !v.includes('-'), // otherwise, compare to proper releases
                  )

                if (!publishedVersionForComparison) {
                  return
                }

                // note: `npm pack foobar` will actually pull foobar.1-2-3.tgz from the registry. It's not actually doing a "pack" at all. `pnpm pack` does not do the same thing - it packs the local directory
                await pipeExeca(subtask, 'npm', ['pack', `${pkg.name}@${publishedVersionForComparison}`], {
                  reject: false,
                  cwd: publishedAlreadyFolder,
                })

                const tgzFileName = fs.readdirSync(publishedAlreadyFolder).at(0)
                if (!tgzFileName) {
                  const msg = `No tgz file found in ${publishedAlreadyFolder}, even though a last release was found. Registry versions: ${registryVersions.join(', ')}`
                  throw new Error(msg)
                }

                await pipeExeca(subtask, 'tar', ['-xvzf', tgzFileName], {cwd: publishedAlreadyFolder})

                const leftPackageJson = loadLHSPackageJson(pkg)
                if (leftPackageJson) {
                  const leftPackageJsonPath = packageJsonFilepath(pkg, LHS_FOLDER)
                  fs.writeFileSync(
                    leftPackageJsonPath,
                    // avoid churn on package.json field ordering, which npm seems to mess with
                    sortPackageJson(JSON.stringify(leftPackageJson, null, 2)),
                  )
                }
              },
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: 'Set target versions',
        task: async function setTargetVersions(ctx, task) {
          const {stdout: rightSha} = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'])
          for (const pkg of ctx.packages) {
            pkg.shas = {
              left: await getPackageLastPublishRef(pkg),
              right: rightSha,
            }
            const changelog = await getChangelog(ctx, pkg)
            if (ctx.versionStrategy.type === 'fixed') {
              pkg.targetVersion = ctx.versionStrategy.version
              continue
            }

            const currentVersion = [loadRHSPackageJson(pkg)?.version, pkg.version]
              .sort((a, b) => semver.compare(a || VERSION_ZERO, b || VERSION_ZERO))
              .at(-1)

            if (ctx.versionStrategy.bump) {
              pkg.targetVersion = semver.inc(currentVersion || VERSION_ZERO, ctx.versionStrategy.bump)
              continue
            }

            const choices = bumpChoices(currentVersion || VERSION_ZERO)
            if (changelog) {
              choices.push({type: 'none', message: `Do not publish (note: package is changed)`, value: 'none'})
            } else {
              choices.unshift({type: 'none', message: `Do not publish (package is unchanged)`, value: 'none'})
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
                validate: (v: unknown) => getBumpedVersionValidation(currentVersion || VERSION_ZERO, v),
              })
            }

            ensureValidBumpedVersion(currentVersion || VERSION_ZERO, newVersion)

            pkg.targetVersion = newVersion
            pkg.changeTypes = new Set(Array.from(changelog?.matchAll(/data-change-type="(\w+)"/g) || []).map(m => m[1]))
          }

          if (ctx.versionStrategy.type === 'fixed') return

          if (ctx.versionStrategy.type === 'independent' && !ctx.versionStrategy.bump) return

          const include = await task.prompt(ListrEnquirerPromptAdapter).run<string[]>({
            type: 'MultiSelect',
            message: 'Select packages',
            hint: 'Press <space> to toggle, <a> to toggle all, <i> to invert selection',
            initial: ctx.packages.flatMap((pkg, i) => (pkg.changeTypes?.size ? [i] : [])),
            choices: ctx.packages.map(pkg => {
              const changeTypes = [...(pkg.changeTypes || [])]
              return {
                name: `${pkg.name} ${changeTypes.length ? `(changes: ${changeTypes.join(', ')})` : '(unchanged)'}`.trim(),
                value: pkg.name,
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
                const packageJson = loadRHSPackageJson(pkg)!

                packageJson.version = pkg.targetVersion
                packageJson.git = {
                  ...(packageJson.git as {}),
                  sha: sha.stdout,
                }

                packageJson.dependencies = await getBumpedDependencies(ctx, {pkg}).then(r => r.dependencies)

                fs.writeFileSync(
                  packageJsonFilepath(pkg, RHS_FOLDER),
                  sortPackageJson(JSON.stringify(packageJson, null, 2)),
                )
              },
            })),
          )
        },
      },
      {
        title: 'Diff packages',
        task: (ctx, task) =>
          task.newListr(
            ctx.packages.map(pkg => ({
              title: `Diff ${pkg.name}`,
              task: async (_ctx, subtask) => {
                const leftFolderPath = path.dirname(packageJsonFilepath(pkg, LHS_FOLDER))
                const rightFolderPath = path.dirname(packageJsonFilepath(pkg, RHS_FOLDER))

                const changesFolder = path.join(pkg.folder, 'changes')
                await fs.promises.mkdir(changesFolder, {recursive: true})

                const leftPackageJson = loadLHSPackageJson(pkg)
                const rightPackageJson = loadRHSPackageJson(pkg)

                if (!leftPackageJson) {
                  subtask.output = 'No published version'
                  return
                }

                await execa('git', ['diff', '--no-index', leftFolderPath, rightFolderPath], {
                  reject: false, // git diff --no-index implies --exit-code. So when there are changes it exits with 1
                  stdout: {
                    file: path.join(changesFolder, 'package.diff'),
                  },
                })

                const leftRef = leftPackageJson.git?.sha
                const rightRef = rightPackageJson?.git?.sha

                if (!rightRef) {
                  throw new Error(`No ref found for package.json preparing to be plubished for ${pkg.name}`)
                }

                if (leftRef && rightRef) {
                  await execa('git', ['diff', rightRef, leftRef, '--', '.'], {
                    cwd: pkg.path,
                    stdout: {
                      file: path.join(changesFolder, 'source.diff'),
                    },
                  })
                }
              },
            })),
            {concurrent: true},
          ),
      },
      {
        title: 'Write changelogs',
        task: async (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Write ${pkg.name} changelog`,
              task: async () => getOrCreateChangelog(ctx, pkg),
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: 'Write context',
        task: async ctx => {
          fs.writeFileSync(path.join(ctx.tempDir, 'context.json'), JSON.stringify(ctx, null, 2))
        },
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
          const publishTasks = createPublishTasks(ctx, {otp})
          if (!shouldActuallyPublish) publishTasks.forEach(t => (t.skip = true))

          return task.newListr(publishTasks, {rendererOptions: {collapseSubtasks: false}})
        },
      },
      {
        title: 'Dry run complete',
        enabled: !input.publish,
        rendererOptions: {persistentOutput: true},
        task: async (ctx, task) => {
          task.output = `To publish, run the following command:`
          task.output += `\n\n`
          task.output += `pnpm npmono prebuilt ${ctx.tempDir}`
        },
      },
    ],
    {ctx: {} as Ctx},
  )

  return tasks.run()
}

const loadContext = (folderPath: string) => {
  const contextFilepath = path.join(folderPath, 'context.json')
  if (!fs.existsSync(contextFilepath)) throw new Error(`No context found at ${contextFilepath}`)
  const ctxString = fs.readFileSync(contextFilepath).toString()
  try {
    const json = JSON.parse(ctxString) as {}
    return Ctx.parse(json)
  } catch (e) {
    throw new Error(`Invalid context at ${contextFilepath}: ${e}`)
  }
}

export const PrebuiltInput = z.tuple([
  z.string().describe('Path to the prebuilt publishable folder'),
  z.object({
    otp: z.string().describe('OTP for publishing. If not provided, you will be prompted for it.').optional(),
  }),
])
type PrebuiltInput = z.infer<typeof PrebuiltInput>

export const publishPrebuilt = async ([folder, options]: PrebuiltInput) => {
  const ctx = loadContext(folder)
  const tasks = new Listr(
    [
      {
        title: 'Get OTP',
        enabled: !options.otp,
        task: async (_ctx, task) => {
          options.otp = await task.prompt(ListrEnquirerPromptAdapter).run<string>({
            message: 'Enter npm OTP',
            type: 'Input',
            validate: v => v === '' || (typeof v === 'string' && /^\d{6}$/.test(v)),
          })
          if (options.otp === '') {
            const confirmed = await task.prompt(ListrEnquirerPromptAdapter).run<boolean>({
              message: 'This will fail unless you have disabled MFA, which is not recommended.',
              type: 'confirm',
            })
            if (!confirmed) {
              throw new Error('OTP not provided')
            }
          }
        },
      },
      ...createPublishTasks(ctx, options),
    ],
    {ctx},
  )

  await tasks.run()
}

const createPublishTasks = (ctx: Ctx, options: {otp?: string}) =>
  ctx.packages.map((pkg): ListrTask => {
    const lhsPackageJson = loadLHSPackageJson(pkg)
    const rhsPackageJson = loadRHSPackageJson(pkg)
    ensureValidBumpedVersion(lhsPackageJson?.version || VERSION_ZERO, rhsPackageJson?.version)
    return {
      title: `Publish ${pkg.name} ${lhsPackageJson?.version || '✨NEW!✨'} -> ${rhsPackageJson?.version}`,
      task: async (_ctx, subtask) => {
        const publishArgs = ['--access', 'public']
        if (options.otp) publishArgs.push('--otp', options.otp)
        await pipeExeca(subtask, 'pnpm', ['publish', ...publishArgs], {
          cwd: path.dirname(packageJsonFilepath(pkg, RHS_FOLDER)),
          env: {
            ...process.env,
            COREPACK_ENABLE_AUTO_PIN: '0',
          },
        })
      },
    }
  })

export const ReleaseNotesInput = z.object({
  comparison: z
    .string()
    .regex(/^\S+\.{2,3}\S+$/)
    .transform(s => {
      const [left, right] = s.split(/\.{2,3}/)
      return {left, right, original: s}
    })
    .optional()
    .describe('The comparison to use for the release notes. Format: `left...right` e.g. `1.0.0...1.0.1`'),
  mode: z.enum(['individual', 'unified']).default('unified'),
})
export type ReleaseNotesInput = z.infer<typeof ReleaseNotesInput>

const pullRegistryPackage = async (
  subtask: ListrTaskWrapper<Ctx, never, never>,
  pkg: {name: string},
  {version, folder}: {version: string; folder: string},
) => {
  // note: `npm pack foobar` will actually pull foobar.1-2-3.tgz from the registry. It's not actually doing a "pack" at all. `pnpm pack` does not do the same thing - it packs the local directory
  await pipeExeca(subtask, 'npm', ['pack', `${pkg.name}@${version}`], {cwd: folder})

  const tgzFileName = fs.readdirSync(folder).at(0)
  if (!tgzFileName) {
    throw new Error(`No tgz file found in ${folder}, tried to pull ${pkg.name}@${version}`)
  }

  await pipeExeca(subtask, 'tar', ['-xvzf', tgzFileName], {cwd: folder})

  const filepath = path.join(folder, 'package', 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}

  return packageJson
}

const openReleaseDraft = async (repoUrl: string, params: {tag: string; title: string; body: string}) => {
  const getUrl = () => `${repoUrl}/releases/new?${new URLSearchParams(params).toString()}`
  if (getUrl().length > 8192) {
    // copy body to clipboard using clipboardy
    const clipboardy = await import('clipboardy')
    await clipboardy.default.write(params.body)
    params = {...params, body: '<!-- body copied to clipboard -->'}
  }
  await execa('open', [getUrl()])
}

const packageJsonFilepath = (pkg: PkgMeta, type: typeof LHS_FOLDER | typeof RHS_FOLDER) =>
  path.join(pkg.folder, type, 'package', 'package.json')

const loadPackageJson = (filepath: string) => {
  const packageJson = JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
  return packageJson
}

const loadLHSPackageJson = (pkg: PkgMeta) => {
  const filepath = packageJsonFilepath(pkg, LHS_FOLDER)
  if (!fs.existsSync(filepath)) return null
  return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
}
const loadRHSPackageJson = (pkg: PkgMeta) => {
  const filepath = packageJsonFilepath(pkg, RHS_FOLDER)
  if (!fs.existsSync(filepath)) return null
  return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
}

const bumpChoices = (oldVersion: string) => {
  const releaseTypes: semver.ReleaseType[] = allReleaseTypes.filter(r => r !== 'prerelease')
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  semver.prerelease(oldVersion) ? releaseTypes.unshift('prerelease') : releaseTypes.push('prerelease')

  return [
    ...releaseTypes.map(type => {
      const result = semver.inc(oldVersion, type)!
      return {
        type: type,
        message: `${type} ${result}`,
        value: result,
      }
    }),
    {
      type: 'other',
      message: 'Other (please specify)',
      value: 'other',
    },
  ]
}

function ensureValidBumpedVersion(lowerBoundVersion: string, v: unknown) {
  const validation = getBumpedVersionValidation(lowerBoundVersion, v)
  if (validation !== true) throw new Error(`Invalid bumped version ${v as string}: ${validation || 'invalid'}`)
}
function getBumpedVersionValidation(lowerBoundVersion: string, v: unknown) {
  if (typeof v !== 'string') return 'Must be a string'
  if (!semver.valid(v)) return 'Must be a valid semver version'
  if (!semver.gt(v, lowerBoundVersion || VERSION_ZERO))
    return `Must be greater than the current version ${lowerBoundVersion}`
  return true
}

function getWorkspaceRoot() {
  return path.dirname(
    findUp.sync('pnpm-workspace.yaml') || findUp.sync('pnpm-lock.yaml') || findUpOrThrow('.git', {type: 'directory'}),
  )
}

/** "Pessimistic" comparison ref. Tries to use the registry package.json's `git.sha` property, and uses the first ever commit to the package folder if that can't be found. */
async function getPackageLastPublishRef(pkg: Pkg) {
  const packageJson = loadRHSPackageJson(pkg)
  return await getPackageJsonGitSha(pkg, packageJson)
}

async function getPackageJsonGitSha(pkg: Pkg, packageJson: PackageJson | null) {
  const explicitSha = packageJson?.git?.sha
  if (explicitSha) return explicitSha
  return await getFirstRef(pkg)
}

async function getFirstRef(pkg: Pkg) {
  const {stdout: commitsOldestFirst} = await execa('git', ['log', '--reverse', '--pretty=format:%h', '--', '.'], {
    cwd: pkg.path,
  })
  return commitsOldestFirst.split('\n')[0]
}

/**
 * For a particular package, get the `dependencies` object with any necessary version bumps.
 * Requires a `pkg`, and an `expectVersion` function
 */
async function getBumpedDependencies(ctx: Ctx, params: {pkg: Pkg}) {
  const leftPackageJson = loadLHSPackageJson(params.pkg)
  const rightPackageJson = loadRHSPackageJson(params.pkg)
  const rightPackageDependencies = {...rightPackageJson?.dependencies}
  const updates: Record<string, string> = {}
  for (const [depName, depVersion] of Object.entries(rightPackageJson?.dependencies || {})) {
    const foundDep = ctx.packages
      .filter(other => other.name === depName)
      .flatMap(other => {
        const prefix = ['', '^', '~'].find(p => depVersion === p + other.version)
        return prefix ? [{pkg: other, prefix}] : []
      })
      .find(Boolean)

    if (!foundDep) {
      continue
    }

    const leftPackageDependencyVersion = leftPackageJson?.dependencies?.[depName]

    const dependencyPackageJsonOnRHS = loadRHSPackageJson(foundDep.pkg)
    let expected = foundDep.pkg.targetVersion
    if (!expected) {
      // ok, looks like we're not publishing the dependency. That's fine, as long as there's an existing published version.
      expected = dependencyPackageJsonOnRHS?.version || null
    }
    if (!expected) {
      throw new Error(
        `Package ${params.pkg.name} depends on ${foundDep.pkg.name} but ${foundDep.pkg.name} is not published, and no target version was set for publishing now. Did you opt to skip publishing ${foundDep.pkg.name}? If so, please re-run and make sure to publish ${foundDep.pkg.name}. You can't publish ${params.pkg.name} until you do that.`,
      )
    }

    // todo: figure out if this shortcut can be actually safe - it isn't right now because the local version doesn't necessarily match the registry version
    // and we should probably be solving this by just filtering out packages that don't need to be published rather than trying to shortcut here
    // if (registryPackageDependencyVersion && semver.satisfies(expected, registryPackageDependencyVersion)) {
    //   // if the expected version is already satisfied by the registry version, then we don't need to bump it
    //   continue
    // }

    const prefix = foundDep.prefix || leftPackageDependencyVersion?.match(/^[^~]/)?.[0] || ''

    rightPackageDependencies[depName] = prefix + expected
    updates[depName] =
      `${leftPackageDependencyVersion || JSON.stringify({params, name: depName, depName: depName, registryPackageJson: dependencyPackageJsonOnRHS}, null, 2)} -> ${rightPackageDependencies[depName]}`
  }

  if (Object.keys(updates).length === 0) {
    // keep reference equality, avoid `undefined` to `{}`
    return {updated: updates, dependencies: rightPackageJson?.dependencies}
  }

  return {updated: updates, dependencies: rightPackageDependencies}
}

/** Get a markdown formatted list of commits for a package. */
async function getPackageRevList(pkg: Pkg) {
  // const fromRef = await getPackageLastPublishRef(pkg)

  // const {stdout: localRef} = await execa('git', ['log', '-n', '1', '--pretty=format:%h', '--', '.'])
  const fromRef = pkg.shas.left
  const localRef = pkg.shas.right
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
    commitBullets.length > 0 && `<h3 data-commits>Commits</h3>\n`,
    ...commitBullets,
    uncommitedChanges.trim() && 'Uncommitted changes:\n' + uncommitedChanges,
  ]
  return {
    // commitComparisonString,
    // versionComparisonString,
    markdown: sections.filter(Boolean).join('\n').trim() || `No ${pkg.name} changes since last publish.`,
  }
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
    const existingContent = fs.readFileSync(changelogFile).toString()
    // hack: sometimes we get a changelog a bit early before the targetVersion is set. Check that the existing version doesn't include 'undefined' so we can try again after the targetVersion is set.
    if (!existingContent.includes('undefined')) {
      return existingContent
    }
  }

  const changelogContent = await getChangelog(ctx, pkg)
  fs.mkdirSync(path.dirname(changelogFile), {recursive: true})
  fs.writeFileSync(changelogFile, changelogContent)
  return changelogContent
}

async function getChangelog(ctx: Ctx, pkg: Pkg) {
  const sourceChanges = await getPackageRevList(pkg)
  const npmVersionLink = (packageJson: PackageJson | null | undefined) => {
    const version = packageJson?.version
    return `[${version || 'unknown'}](https://npmjs.com/package/${pkg.name}${version ? `/v/${version}` : ''})`
  }
  const repoUrl = getPackageJsonRepository(
    loadRHSPackageJson(pkg) ||
      loadLHSPackageJson(pkg) ||
      loadPackageJson(path.join(getWorkspaceRoot(), 'package.json')),
  )

  const changes: string[] = []
  if (sourceChanges) {
    changes.push(
      [
        `<!-- data-change-type="source" data-pkg="${pkg.name}" -->`, // break
        `# ${pkg.name}`,
        '',
        '|old version|new version|compare|',
        '|-|-|-|',
        `|${npmVersionLink(loadLHSPackageJson(pkg))} | ${npmVersionLink(loadRHSPackageJson(pkg))} | [${pkg.shas.left}...${pkg.shas.right}](${repoUrl}/compare/${pkg.shas.left}...${pkg.shas.right})`,
        '',
        sourceChanges.markdown,
      ].join('\n'),
    )
  }

  const bumpedDeps = await getBumpedDependencies(ctx, {pkg})

  for (const depPkg of workspaceDependencies(pkg, ctx)) {
    const dep = depPkg.name
    if (bumpedDeps.updated[dep]) {
      const depChanges = await getChangelog(ctx, depPkg)
      const verb = depChanges?.includes('data-commits') ? 'changed' : 'bumped'
      const newMessage = [
        '<!-- data-change-type="dependencies" -->',
        `<details>`,
        `<summary>Dependency ${depPkg.name} ${verb} (${bumpedDeps.updated[dep]})</summary>`,
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
  return changelogContent
}

const getPackageJsonRepository = (packageJson: PackageJson) => {
  let repoString: string
  if (!packageJson.repository) return null
  if (typeof packageJson.repository === 'object' && packageJson.repository.type !== 'git') {
    throw new Error(`Unsupported repository type ${packageJson.repository.type}`)
  }
  // mmkal
  // eslint-disable-next-line unicorn/prefer-ternary
  if (typeof packageJson.repository === 'object') {
    repoString = packageJson.repository.url
  } else {
    // must be a string
    repoString = packageJson.repository
  }

  if (repoString.startsWith('git+')) {
    repoString = repoString.replace('git+', '')
  }
  if (repoString.startsWith('github:')) {
    repoString = repoString.replace('github:', 'https://github.com/')
  }
  if (repoString.startsWith('gitlab:')) {
    repoString = repoString.replace('gitlab:', 'https://gitlab.com/')
  }
  if (repoString.startsWith('bitbucket:')) {
    repoString = repoString.replace('bitbucket:', 'https://bitbucket.org/')
  }
  if (repoString.endsWith('.git')) {
    repoString = repoString.slice(0, -4)
  }
  if (/^[\w-.]+\/[\w-.]+$/.test(repoString)) {
    repoString = `https://github.com/${repoString}`
  }

  const url = new URL(repoString)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported repository protocol ${url.protocol}`)
  }

  return repoString
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

const PackageJson = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  /**
   * not an official package.json field, but there is a library that does something similar to this: https://github.com/Metnew/git-hash-package
   * having git.sha point to a commit hash seems pretty useful to me, even if it's not standard.
   * tagging versions in git is still a good best practice but there are many different ways, e.g. `1.2.3` vs `v1.2.3` vs `mypkg@1.2.3` vs `mypkg@v1.2.3`
   * plus, that's only useful in going from git to npm, not npm to git.
   */
  git: z.object({sha: z.string().optional()}).optional(),
  repository: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
})

const PkgMeta = z.object({
  folder: z.string(),
  targetVersion: z.string().nullable(),
  changeTypes: z.set(z.string()).optional(),
  shas: z.object({
    left: z.string(),
    right: z.string(),
  }),
})

const Pkg = PkgMeta.extend({
  name: z.string(),
  version: z.string(),
  path: z.string(),
  private: z.boolean(),
  publishedVersions: z.array(z.string()),
  dependencies: z
    .record(
      z.string(),
      z.object({
        from: z.string(),
        version: z.string(),
        path: z.string(),
      }),
    )
    .optional(),
})

export const Ctx = z.object({
  tempDir: z.string(),
  versionStrategy: z.union([
    z.object({type: z.literal('fixed'), version: z.string()}).readonly(),
    z
      .object({
        type: z.literal('independent'),
        bump: z.union([
          z.enum(['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease']),
          z.null(),
        ]),
      })
      .readonly(),
  ]),
  packages: z.array(Pkg),
})

type PackageJson = z.infer<typeof PackageJson>
type PkgMeta = z.infer<typeof PkgMeta>
type Pkg = z.infer<typeof Pkg>
type Ctx = z.infer<typeof Ctx>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipeExeca = async (task: ListrTaskWrapper<any, any, any>, file: string, args: string[], options?: Options) => {
  const cmd = execa(file, args, {
    ...options,
    env: {
      ...options?.env,
      COREPACK_ENABLE_STRICT: '0',
    },
  })
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

// this doesn't work yet
// consider making it a separate command that can read the folder made by the main publish command
export const releaseNotes = async (input: ReleaseNotesInput) => {
  const tasks = new Listr<Ctx, never, never>(
    [
      ...setupContextTasks,
      {
        title: `Get comparison`,
        enabled: () => !input.comparison,
        task: async (ctx, task) => {
          const pkgVersions = await Promise.all(ctx.packages.map(pkg => getRegistryVersions(pkg)))
          const lasts = pkgVersions.map(v => v.at(-1)!.slice())
          const latest = lasts.sort((a, b) => semver.compare(a, b)).at(-1)!
          const all = pkgVersions.flat().sort((a, b) => semver.compare(a, b))

          const left =
            all
              .slice(0, -1)
              .reverse()
              .find(v => {
                if (v === latest) return false
                if (semver.prerelease(latest)) return true // if RHS is prerelease, then we whichever version was immediately before it
                return !semver.prerelease(v) // if RHS was a proper release, then we want the last proper release
              })! || all[0]

          input.comparison = {left, right: latest, original: `${left}...${latest}`}
          task.output = `Using ${input.comparison.original} for release notes`
        },
        rendererOptions: {persistentOutput: true},
      },
      {
        title: 'Write packages locally',
        task: async (ctx, task) => {
          return task.newListr<Ctx>(
            ctx.packages.map(pkg => ({
              title: `Write ${pkg.name} locally`,
              task: async (_ctx, subtask) => {
                if (!input.comparison) throw new Error('No comparison provided')
                const pullables = [
                  {str: input.comparison.left, folder: path.join(pkg.folder, LHS_FOLDER), side: 'left' as const},
                  {str: input.comparison.right, folder: path.join(pkg.folder, RHS_FOLDER), side: 'right' as const},
                ]
                for (const pullable of pullables) {
                  fs.mkdirSync(pullable.folder, {recursive: true})
                  if (semver.valid(pullable.str)) {
                    if (pullable.side === 'right') pkg.targetVersion = pullable.str
                    subtask.output = `Pulling ${pullable.str} for ${pkg.name}`
                    const packageJson = await pullRegistryPackage(subtask, pkg, {
                      version: pullable.str,
                      folder: pullable.folder,
                    }).catch(async e => {
                      if (`${e}`.includes('No matching version found')) {
                        // if the version doesn't exist on the registry, we might have passed a comparison string from before it existed (can happen with fixed versioning)
                        const versions = await getRegistryVersions(pkg)
                        return pullRegistryPackage(subtask, pkg, {
                          version: pullable.side === 'left' ? versions[0] : versions.at(-1)!,
                          folder: pullable.folder,
                        })
                      }
                      throw e
                    })
                    pkg.shas ||= {} as never
                    pkg.shas[pullable.side] = await getPackageJsonGitSha(pkg, packageJson)
                  } else if (/^[\da-f]+/.test(pullable.str)) {
                    // actually it's a sha
                    pkg.shas ||= {} as never
                    pkg.shas[pullable.side] = pullable.str
                    const versions = await getRegistryVersions(pkg)
                    for (const version of versions.slice().reverse()) {
                      subtask.output = `Pulling ${version} for ${pkg.name}`
                      const packedPackageJson = await pullRegistryPackage(subtask, pkg, {
                        version,
                        folder: pullable.folder,
                      })
                      if (packedPackageJson.git?.sha === pullable.str) {
                        if (pullable.side === 'right') pkg.targetVersion = packedPackageJson.version!
                        break
                      }
                    }
                  } else {
                    throw new Error(`Unknown release ${pullable.str} for ${pkg.name}`)
                  }
                }
              },
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: 'Write changelogs',
        task: async (ctx, task) => {
          return task.newListr(
            ctx.packages.map(pkg => ({
              title: `Write ${pkg.name} changelog`,
              task: async () => getOrCreateChangelog(ctx, pkg),
            })),
            {concurrent: true},
          )
        },
      },
      {
        title: 'Generate release notes',
        task: async (ctx, task) => {
          const allChangelogs = await Promise.all(
            ctx.packages.map(async pkg => ({
              pkg,
              changelog: await getOrCreateChangelog(ctx, pkg),
            })),
          )
          const rootPackageJson = loadPackageJson(path.join(getWorkspaceRoot(), 'package.json'))
          const repoUrl = getPackageJsonRepository(rootPackageJson)
          if (!repoUrl) {
            const message =
              'No repository URL found in root package.json - please add a repository field like `"repository": {"type": "git", "url": "https://githbu.com/foo/bar"}`'
            throw new Error(message)
          }
          const versions = [
            ...new Set(ctx.packages.map(p => (p.targetVersion ? `v${p.targetVersion}` : '')).filter(Boolean)),
          ]
          if (input.mode === 'unified') {
            if (versions.length !== 1) {
              throw new Error('Unified mode requires exactly one version')
            }
            const unified = allChangelogs.map(p => p.changelog).join('\n\n---\n\n')
            const doRelease = await task.prompt(ListrEnquirerPromptAdapter).run<boolean>({
              type: 'confirm',
              message: unified + '\n\nDraft release?',
            })
            if (doRelease) {
              const releaseParams = {
                tag: versions[0],
                title: versions[0],
                body: unified,
              }
              // await execa('open', [`${repoUrl}/releases/new?${new URLSearchParams(releaseParams).toString()}`])
              await openReleaseDraft(repoUrl, releaseParams)
            }
          } else {
            for (const pkg of ctx.packages) {
              const body = await getOrCreateChangelog(ctx, pkg)
              const title = `${pkg.name}@v${pkg.targetVersion}`
              const tag = `${pkg.name}@v${pkg.targetVersion}` // same as title... today
              const message = `👇👇👇${title} changelog👇👇👇\n\n${body}\n\n👆👆👆${title} changelog👆👆👆`
              const doRelease = await task.prompt(ListrEnquirerPromptAdapter).run<boolean>({
                type: 'confirm',
                message: message + '\n\nDraft release?',
                initial: false,
              })
              if (doRelease) {
                const releaseParams = {tag, title, body}
                await openReleaseDraft(repoUrl, releaseParams)
              }
            }
          }
        },
      },
    ],
    {ctx: {} as Ctx},
  )

  await tasks.run()
}
