import {DocsThemeConfig} from 'nextra-theme-docs'

export default {
  logo: <img width={150} src="/images/logo.svg" alt="logo" />,
  project: {
    link: 'https://github.com/mmkal/slonik-tools',
  },
  chat: {
    link: 'https://x.com/mmkalmmkal',
  },
  footer: {
    text: 'pgkit.dev',
  },
  banner: {
    text: (
      <>
        🧪 pgkit is under active development. You can <i>probably</i> safely use it in production, since the underlying
        driver is just pg-promise.
        <br />
        But if you don't want to be on the cutting edge of things, use it on a test project first, or{' '}
        <a style={{textDecoration: 'underline'}} target="_blank" href="https://discord.com/users/mmkal">
          DM me
        </a>
        .
      </>
    ),
  },
  docsRepositoryBase: 'https://github.com/mmkal/slonik-tools/tree/pgkit', // base URL for the docs repository
  useNextSeoProps: () => ({
    titleTemplate: '%s - pgkit',
  }),
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="pgkit: postgresql typescript toolkit" />
      <meta name="og:title" content="pgkit: postgresql typescript toolkit" />
    </>
  ),
  faviconGlyph: '⌗',
} satisfies DocsThemeConfig
