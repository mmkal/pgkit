/** For some reason if you call `require.main` in a `.test.ts` file you get null. So use this instead */
export const requireDotMain = require.main
