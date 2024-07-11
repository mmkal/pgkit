import {DocsThemeConfig} from 'nextra-theme-docs'

export default {
  logo: <img width={150} src="/images/logo.svg" alt="logo" />,
  project: {
    link: 'https://github.com/mmkal/slonik-tools',
  },
  chat: {
    link: 'https://discord.com/users/mmkal',
  },
  footer: {
    text: 'pgkit.dev',
  },
  docsRepositoryBase: 'https://github.com/mmkal/slonik-tools/tree/pgkit', // base URL for the docs repository
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="pgkit: postgresql typescript toolkit" />
      <meta name="og:title" content="pgkit: postgresql typescript toolkit" />
    </>
  ),
} satisfies DocsThemeConfig
