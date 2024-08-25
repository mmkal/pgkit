import {DocsThemeConfig} from 'nextra-theme-docs'

export default {
  logo: <img width={150} src="/images/logo.svg" alt="logo" />,
  project: {
    link: 'https://github.com/mmkal/pgkit',
  },
  chat: {
    link: 'https://x.com/mmkalmmkal',
  },
  footer: {
    text: 'pgkit.dev',
    // content: 'pgkit.dev', // text->content in v3
  },
  banner: {
    text: (
      <>
        🧪 pgkit is under active development.
        <br />
        Use with caution for now/{' '}
        <a style={{textDecoration: 'underline'}} target="_blank" href="https://x.com/mmkalmmkal">
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
