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

const packages: string[] = ["core", "mailgun", "smtp"];
const jsrRefPlugins: any[] = [];

for (const pkg of packages) {
  jsrRefPlugins.push(
    await jsrRef({
      package: `@upyo/${pkg}`,
      version: "unstable",
      cachePath: `.jsr-cache-${pkg}.json`,
    }),
  );
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
    ],

    sidebar: [
      { text: "Why Upyo?", link: "/why" },
      { text: "Getting started", link: "/start" },
      { text: "Changelog", link: "/changelog" },
    ],

    socialLinks: [
      { icon: "jsr", link: "https://jsr.io/@upyo/core" },
      { icon: "npm", link: "https://www.npmjs.com/package/@upyo/core" },
      { icon: "github", link: "https://github.com/dahlia/upyo" },
    ],
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
