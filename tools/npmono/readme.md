# npmono

Intended to be the [np](https://npmjs.com/package/np) for monorepos. (So it's pronounced "np mono", not "npm, oh no!")

The main reason for its existence, rather than using changesets, which is the usual recommendation: I wanted something more suitable for process-light repos. Changesets requires commiting changesets files along with changes. There's plenty of tooling to help with this, but that tooling needs to be installed and correctly configured. And much of it doesn't work with local branches, and it can be difficult to work around when commits have gone in that _don't_ use changeset. In practice that means every contributor needs to  install the changesets tooling and consistently use it. And in my experience, with the right git hygiene (meaningful commits to master, via squash-merged pull requests with full descriptions), there's no actual value to "changeset" files other than the changesets tool itself. So, I wanted a tool that avoided all that overhead, and could just publish packages in a monorepo sensibly.

Some principles:

- no other tooling/infrastructure required
- dry-run by default - only perform any side-effects when explicitly requested:
  - pre-publish version bumping is done in a "staging area" - a temp directory, so that any aborted attempts _can't_ have an affect on the source repo
  - publishing is skipped unless an explicit CLI argument is passed
- use git commit messages for changelogs
- preview offline
- work with any registry
- no "one-way doors" - switch at-will between fixed and independent versioning

## Usage

```
npx npmono
```

The above is a dry run. What it will do under the hood:

1. Find all packages in your (pnpm) monorepo, ordered topologically (most depended-on packages first)
1. Build each package - assuming a `pnpm build` script on each
1. Create a temp directory on your filesystem. This directory will be printed to stdout so you can explore it to confirm it looks right.
1. Pack each package into a tarball inside its own folder in the temp directory
1. Pull the latest package published to the registry for each
1. Prompt you for the new version for the packages. Options here are
   1. Fixed versioning. Each package will be published with the same version, based on a "bump" of the _latest_ version of all packages from the registry. Bump types are:
      1. Any valid semver increment string [(see `semver.inc(...)` docs)](https://www.npmjs.com/package/semver#functions).
      1. `Other` - type in the new version yourself. Note that it must be greater than the latest published version of all packages.
   1. Independent versioning. Each package will be published with a version based on the "bump" of its own latest published version from the registry. Options are:
      1. Any valid semver increment string [(see `semver.inc(...)` docs)](https://www.npmjs.com/package/semver#functions).
      1. `Ask` - you will be given a similar prompt for the new version of each package. You will be able to select to skip publishing any given package.
1. Update the package.json files in each package in the temp directory, prompting if necessary (if using independent versioning)
1. Diff packages and create changelogs:
   1. Look for a `.git.sha` property in each package.json file, falling back to the first commit to the package folder.
   1. Use git to find all commits between the `.git.sha` reference and the current HEAD.
   1. Creates a changelog file for each package, based on:
      1. The commits to the package since the last published version
      1. The changelog of any dependencies that have been updated
   1. Use `git diff` to write diff files:
      1. `source.diff` - the changes to source files (i.e. not gitignore'd) - often, `.ts` files and so on
      1. `package.diff` - the changes to the actual package files - compiled `.js` files etc.
1. If you pass the `--publish` flag:
   1. You will be prompted to enter an OTP for each package unless you pass the `--otp` flag via the CLI (if you don't have MFA enabled, just press enter to publish without a OTP - not recommended)
   1. Publish the packages to the registry

Note that at no point does it modify any files outside of the temp directory. You don't need to worry about abandoning halfway through and leaving your repo in a messy state where the version is bumped but the publish hasn't happened.

## Caveats/limitations

- Only works on pnpm monorepos
