import {DocsThemeConfig} from 'nextra-theme-docs'
import {useConfig} from 'nextra-theme-docs'

export default {
  logo: <img width={150} src="/images/logo.svg" alt="logo" />,
  project: {
    link: 'https://github.com/mmkal/pgkit',
  },
  chat: {
    link: 'https://x.com/mmkalmmkal',
    icon: (
      // from https://about.x.com/en/who-we-are/brand-toolkit
      <svg width="24" height="24" viewBox="0 0 1200 1227" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
          fill="white"
        />
      </svg>
    ),
  },
  backgroundColor: {
    // dark: 'rgb(31 41 55 / var(--tw-bg-opacity, 1))', // bg-gray-800
    dark: 'green',
  },
  footer: {
    content: 'pgkit.dev',
  },
  banner: {
    content: (
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
  docsRepositoryBase: 'https://github.com/mmkal/pgkit/tree/pgkit', // base URL for the docs repository
  // useNextSeoProps: () => ({
  //   titleTemplate: '%s - pgkit',
  // }),
  head: () => {
    const config = useConfig()
    const title = [config.frontMatter.title, 'pgkit'].filter(Boolean).join(' - ')
    return (
      <>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={`${title}: postgresql typescript toolkit`} />
        <meta name="og:title" content={`${title}: postgresql typescript toolkit`} />
      </>
    )
  },
  faviconGlyph: '⌗',
} satisfies DocsThemeConfig
