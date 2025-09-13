import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import { jsrRef } from "markdown-it-jsr-ref";
import process from "node:process";
import { defineConfig } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import llmstxt from "vitepress-plugin-llms";

const packages: readonly string[] = [
  "core",
  "mailgun",
  "plunk",
  "resend",
  "smtp",
  "pool",
  "mock",
];
const jsrRefPlugins: any[] = [];

for (const pkg of packages) {
  jsrRefPlugins.push(
    await jsrRef({
      package: `@upyo/${pkg}`,
      version: process.env.JSR_REF_VERSION ?? "unstable",
      cachePath: `.jsr-cache-${pkg}.json`,
    }),
  );
}

let extraNav: { text: string; link: string }[] = [];
if (process.env.EXTRA_NAV_TEXT && process.env.EXTRA_NAV_LINK) {
  extraNav = [
    {
      text: process.env.EXTRA_NAV_TEXT,
      link: process.env.EXTRA_NAV_LINK,
    },
  ];
}

let plausibleScript: [string, Record<string, string>][] = [];
if (process.env.PLAUSIBLE_DOMAIN) {
  plausibleScript = [
    [
      "script",
      {
        defer: "defer",
        "data-domain": process.env.PLAUSIBLE_DOMAIN,
        src: "https://plausible.io/js/plausible.js",
      },
    ],
  ];
}

const NAV = [
  {
    text: "Messages",
    items: [
      { text: "Composing messages", link: "/messages/compose" },
      { text: "Attachments", link: "/messages/attachments" },
    ],
  },
  {
    text: "Transports",
    items: [
      { text: "SMTP", link: "/transports/smtp" },
      { text: "Mailgun", link: "/transports/mailgun" },
      { text: "Plunk", link: "/transports/plunk" },
      { text: "Resend", link: "/transports/resend" },
      { text: "SendGrid", link: "/transports/sendgrid" },
      { text: "Amazon SES", link: "/transports/ses" },
      { text: "OpenTelemetry", link: "/transports/opentelemetry" },
      { text: "Pool transport", link: "/transports/pool" },
      { text: "Mock transport", link: "/transports/mock" },
      { text: "Custom transport", link: "/transports/custom" },
    ],
  },
  {
    text: "References",
    items: [
      { text: "@upyo/core", link: "https://jsr.io/@upyo/core/doc" },
      { text: "@upyo/smtp", link: "https://jsr.io/@upyo/smtp/doc" },
      { text: "@upyo/mailgun", link: "https://jsr.io/@upyo/mailgun/doc" },
      { text: "@upyo/plunk", link: "https://jsr.io/@upyo/plunk/doc" },
      { text: "@upyo/resend", link: "https://jsr.io/@upyo/resend/doc" },
      { text: "@upyo/sendgrid", link: "https://jsr.io/@upyo/sendgrid/doc" },
      { text: "@upyo/ses", link: "https://jsr.io/@upyo/ses/doc" },
      {
        text: "@upyo/opentelemetry",
        link: "https://jsr.io/@upyo/opentelemetry/doc",
      },
      { text: "@upyo/pool", link: "https://jsr.io/@upyo/pool/doc" },
      { text: "@upyo/mock", link: "https://jsr.io/@upyo/mock/doc" },
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Upyo",
  description:
    "A simple and cross-runtime library for sending email messages using SMTP and various email providers",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/logo.svg",
    nav: [
      { text: "Why", link: "/why" },
      { text: "Start", link: "/start" },
      ...NAV,
      ...extraNav,
    ],

    sidebar: [
      { text: "Why Upyo?", link: "/why" },
      { text: "Getting started", link: "/start" },
      ...NAV,
      { text: "Changelog", link: "/changelog" },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "jsr", link: "https://jsr.io/@upyo/core" },
      { icon: "npm", link: "https://www.npmjs.com/package/@upyo/core" },
      { icon: "github", link: "https://github.com/dahlia/upyo" },
    ],

    editLink: {
      pattern: "https://github.com/dahlia/upyo/edit/main/docs/:path",
    },
  },

  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/favicon-192x192.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
    ],
    [
      "meta",
      {
        property: "og:image",
        content:
          "https://repository-images.githubusercontent.com/1017771339/9f298803-20fb-4a3a-875b-63858a325ba6",
      },
    ],
    ...plausibleScript,
  ],

  cleanUrls: true,

  markdown: {
    theme: {
      light: "light-plus",
      dark: "monokai",
    },
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            types: ["dom", "dom.iterable", "esnext", "node"],
          },
        },
      }),
    ],
    config(md) {
      md.use(deflist);
      md.use(footnote);
      md.use(groupIconMdPlugin);
      for (const plugin of jsrRefPlugins) md.use(plugin);
    },
  },

  sitemap: {
    hostname: process.env.SITEMAP_HOSTNAME,
  },

  vite: {
    plugins: [
      groupIconVitePlugin(),
      llmstxt({
        ignoreFiles: [
          "changelog.md",
        ],
      }),
    ],
  },

  transformHead(context) {
    return [
      [
        "meta",
        { property: "og:title", content: context.title },
      ],
      [
        "meta",
        { property: "og:description", content: context.description },
      ],
    ];
  },
});
