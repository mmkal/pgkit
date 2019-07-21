set -e

# After versioning/tagging/publishing, lerna does not update `package-lock.json` files: https://github.com/lerna/lerna/issues/1998
# So the publish script prevents tags from being pushed by `lerna version`, and instead
# pushes them manually after running `npm run reinstall`

npx lerna version
npx lerna publish from-package
npm run reinstall
git commit --amend
git push --follow-tags
