import {Options, execa} from '@rebundled/execa'
import {Listr, ListrTaskWrapper} from 'listr2'
import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'
import * as semver from 'semver'
import { inspect } from 'util'

const main = async () => {
    const packageJsonFilepath = (pkg: PkgMeta, type: 'local' | 'registry') => path.join(pkg.folder, type, 'package', 'package.json')
    const loadLocalPackageJson = (pkg: PkgMeta) => {
        const filepath = packageJsonFilepath(pkg, 'local')
        return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
    }
    const loadRegistryPackageJson = (pkg: PkgMeta) => {
        const filepath = packageJsonFilepath(pkg, 'registry')
        if (!fs.existsSync(filepath)) return null
        return JSON.parse(fs.readFileSync(filepath).toString()) as PackageJson & {git?: {sha?: string}}
    }
    type Ctx = {
        tempDir: string
        versionStrategy:
            | {type: 'fixed'; version: string}
            | {type: 'independent'}
        publishTag: string
        packages: Array<PkgMeta & {
            name: string;
            version: string;
            path: string;
            private: boolean;
            dependencies: Record<string, {
                from: string
                version: string
                path: string
            }>
        }>
    }
    const tasks = new Listr([
        {
            title: 'Building',
            task: async (_ctx, task) => pipeExeca(task, 'pnpm', ['--workspace', 'build'])
        },
        {
            title: 'Get temp directory',
            rendererOptions: {persistentOutput: true},
            task: async (ctx, task) => {
                const list = await execa('pnpm', ['list', '--json', '--depth', '0', '--filter', '.'])
                const pkgName = JSON.parse(list.stdout)[0].name
                ctx.tempDir = path.join('/tmp/publishing', pkgName, Date.now().toString())
                task.output = ctx.tempDir
                fs.mkdirSync(ctx.tempDir, { recursive: true })
            }
        },
        {
            title: 'Collecting packages',
            rendererOptions: {persistentOutput: true},
            task: async (ctx, task) => {
                const list = await execa('pnpm', ['list', '--json', '--recursive', '--only-projects', '--prod', '--filter', './packages/*'])

                ctx.packages = JSON.parse(list.stdout)

                const pwdsCommand = await execa('pnpm', ['recursive', 'exec', 'pwd'])
                const pwds = pwdsCommand.stdout.split('\n').map(s => s.trim()).filter(Boolean)

                ctx.packages
                    .sort((a, b) => a.name.localeCompare(b.name)) // sort alphabetically first, as a tiebreaker (`.sort` is stable)
                    .sort((a, b) => pwds.indexOf(a.path) - pwds.indexOf(b.path)) // then topologically

                ctx.packages.forEach((pkg, i, {length}) => {
                    const number = Number(`1${'0'.repeat(length.toString().length + 1)}`) + i
                    pkg.folder = path.join(ctx.tempDir, `${number}.${pkg.name.replace('/', '__')}`)
                })
                task.output = ctx.packages.map(pkg => `${pkg.name}`).join('\n')
                return `Found ${ctx.packages.length} packages to publish`
            }
        },
        {
            title: `Writing local packages`,
            task: (ctx, task) => {
                return task.newListr(
                    ctx.packages.map(pkg => ({
                        title: `Packing ${pkg.name}`,
                        task: async (ctx, task) => {
                            const localFolder = path.join(pkg.folder, 'local')
                            await pipeExeca(task, 'pnpm', ['pack', '--pack-destination', localFolder], { cwd: pkg.path })

                            const tgzFileName = fs.readdirSync(localFolder).at(0)!
                            await pipeExeca(task, 'tar', ['-xvzf', tgzFileName], { cwd: localFolder })
                        }
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
                            fs.mkdirSync(registryFolder, { recursive: true })
                            // note: `npm pack foobar` will actually pull foobar.1-2-3.tgz from the registry. It's not actually doing a "pack" at all. `pnpm pack` does not do the same thing!
                            await pipeExeca(task, 'npm', ['pack', pkg.name], {
                                cwd: registryFolder,
                            })

                            const tgzFileName = fs.readdirSync(registryFolder).at(0)!
                            await pipeExeca(task, 'tar', ['-xvzf', tgzFileName], { cwd: registryFolder })
                        }
                    })),
                    {concurrent: true},
                )
            },
        },
        // {
        //     title: `Getting last published versions`,
        //     rendererOptions: {persistentOutput: true},
        //     task: (ctx, task) => {
        //         return task.newListr(
        //             ctx.packages.map(pkg => ({
        //                 title: `Looking up ${pkg.name} version`,
        //                 rendererOptions: {persistentOutput: true},
        //                 enabled: () => !pkg.private,
        //                 task: async (ctx, task) => {
        //                     let pkgView = await pipeExeca(task, 'pnpm', ['view', pkg.name, 'versions', '--json'], {
        //                         reject: false,
        //                     })

        //                     let json = pkgView.stdout.toString()
        //                     if (!json.startsWith('[')) json = `[${json}]` // weird npm view bug
                            
        //                     if (json.includes(`"E404"`)) {
        //                         task.output = 'No published versions'
        //                         return
        //                     }

        //                     const list = JSON.parse(json) as string[]
        //                     const latest = list.sort(semver.compare).at(-1)

        //                     assert.ok(typeof latest === 'string', `Expected latest version to be a string, got ${inspect(latest)}`)

        //                     pkg.lastPublishedVersion = latest
        //                     task.output = latest
        //                 },
        //             })),
        //             {
        //                 rendererOptions: {collapseSubtasks: false},
        //                 concurrent: true,
        //             },
        //         )
        //     }
        // },
        {
            title: 'Get version strategy',
            rendererOptions: {persistentOutput: true},
            task: (ctx, task) => {
                const allVersions = [
                    ...ctx.packages.map(pkg => pkg.version),
                    ...ctx.packages.map(pkg => loadRegistryPackageJson(pkg)?.version).filter(Boolean) as string[],
                ]
                const maxVersion = allVersions.sort(semver.compare).at(-1)
                if (!maxVersion) throw new Error(`No versions found`)
                const bumpedVersion = semver.inc(maxVersion, 'patch')!
                // todo: use enquirer to ask
                ctx.versionStrategy = {type: 'fixed', version: bumpedVersion}
                task.output = inspect(ctx.versionStrategy)
            },
        },
        {
            title: 'Set target versions',
            rendererOptions: {persistentOutput: true},
            task: (ctx, task) => task.newListr<Ctx>(
                ctx.packages.map(pkg => ({
                    title: `Setting target version for ${pkg.name}`,
                    task: async (ctx, task) => {
                        if (ctx.versionStrategy.type === 'fixed') {
                            pkg.targetVersion = ctx.versionStrategy.version
                        } else {
                            // todo: use enquirer to ask
                            throw new Error(`Not implemented: version strategy ${ctx.versionStrategy.type}`)
                        }
                    }
                })),
            )
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
                                cwd: pkg.path
                            })
                            const packageJson = loadLocalPackageJson(pkg)
                            if (ctx.versionStrategy.type === 'fixed') {
                                packageJson.version = ctx.versionStrategy.version
                                packageJson.git = {
                                    ...packageJson.git as {},
                                    sha: sha.stdout,
                                }
                            } else {
                                throw new Error(`Not implemented: version strategy ${ctx.versionStrategy.type}`)
                            }

                            Object.entries(packageJson.dependencies || {}).forEach(([name, version]) => {
                                const found = ctx.packages.find(other => {
                                    return other.name === name && other.version === version
                                })
                                if (found) {
                                    packageJson.dependencies![name] = found.targetVersion
                                }
                            })

                            fs.writeFileSync(packageJsonFilepath(pkg, 'local'), JSON.stringify(packageJson, null, 2))
                        },
                    }))
                )
            }
        },
        {
            title: 'Diff packages',
            task: async (ctx, task) => {
                return task.newListr(
                    ctx.packages.map(pkg => ({
                        title: `Diff ${pkg.name}`,
                        task: async (ctx, task) => {
                            const localPath = path.dirname(packageJsonFilepath(pkg, 'local'))
                            const registryPath = path.dirname(packageJsonFilepath(pkg, 'registry'))

                            const changesFolder = path.join(pkg.folder, 'changes')
                            await fs.promises.mkdir(changesFolder, { recursive: true })

                            const localPkg = loadLocalPackageJson(pkg)
                            const registryPkg = loadRegistryPackageJson(pkg)

                            if (!registryPkg) {
                                task.output = 'No published version'
                                return
                            }

                            await execa('git', ['diff', '--no-index', registryPath, localPath], {
                                reject: false, // git diff --no-index implies --exit-code. So when there are changes it exits with 1
                                stdout: {
                                    file: path.join(changesFolder, 'package.diff')
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
                                        file: path.join(changesFolder, 'source.diff')
                                    },
                                })
                            }
                        }
                    })),
                    {concurrent: true},
                )
            },
        },
        {
            title: 'Publish packages',
            skip: () => !process.argv.includes('--publish'),
            task: (ctx, task) => {
                const otpArgs = process.argv.filter((a, i, arr) => a.startsWith('--otp') || arr[i - 1] === '--otp')
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
                    }))
                )
            }
        }
    ], { ctx: {} as Ctx })
    
    await tasks.run()
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
    targetVersion: string
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
