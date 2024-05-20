# npmono

Intended to be the [np](https://npmjs.com/package/np) for monorepos.

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