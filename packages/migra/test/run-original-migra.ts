export async function runOriginalMigra(...args: string[]): Promise<{stdout: string; stderr: string}> {
  const {execa} = await import('execa')

  try {
    // Check if migra CLI is installed and accessible
    await execa('migra', ['--help'], {
      cwd: process.cwd(),
      env: process.env,
    })

    // If check passes, run migra with provided args
    return await execa('migra', args, {
      cwd: process.cwd(),
      env: process.env,
      reject: false,
    })
  } catch {
    //Replace urls so docker can access current network
    const resolvedArgs = args.map(arg => arg.replaceAll('localhost', 'host.docker.internal'))
    const fullArgs = [
      'run',
      '--rm',
      '-v',
      `${process.cwd()}:/work`,
      '-w',
      '/work',
      'djrobstep/migra:latest',
      'migra',
      ...resolvedArgs,
    ]
    const result = await execa('docker', fullArgs, {reject: false})
    //The latest djrobstep migra is only built for arm64 and the amd64 versions do not have the --ignore-extensions flag so this hack must be done sadly
    const stderr = result.stderr.replaceAll(
      /WARNING: The requested image's platform \(linux\/[^)]+\) does not match the detected host platform \(linux\/[^)]+\) and no specific platform was requested\n?/g,
      '',
    )
    return {
      stdout: result.stdout,
      stderr,
    }
  }
}
