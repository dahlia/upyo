---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

description: >-
  Upyo is a simple and modern email sending library with a universal interface
  for emailing across runtimes like Node.js, Deno, Bun, and edge functions.
  It provides type-safe APIs, dead simple usage, and supports multiple email
  providers.

hero:
  name: "Upyo"
  text: "Simple and modern email sending library"
  tagline: Universal interface for emailing across runtimes
  image:
    src: /logo.svg
    alt: Upyo logo
  actions:
  - theme: brand
    text: Get started
    link: /start
  - theme: alt
    text: Why Upyo?
    link: /why
  - theme: alt
    text: GitHub
    link: https://github.com/dahlia/upyo

features:
- title: Cross-runtime
  details: >-
    Works seamlessly on Node.js, Deno, Bun, and edge functions with consistent
    API.
  icon: 🌍
- title: Dead simple
  details: Intuitive API for sending emails with just a few lines of code.
  icon: 🎮
- title: Type-safe
  details: >-
    TypeScript-first design with discriminated unions for compile-time error
    handling safety.
  icon: 🛡️
- title: Lightweight
  details: Zero dependencies and minimal footprint for fast integration.
  icon: 🪶
- title: Built for testing
  details: >-
    Comprehensive mock transport for reliable testing without sending real
    emails.
  icon: 🧪
- title: Provider independence
  details: >-
    Switch between SMTP, Mailgun, SendGrid, Amazon SES, and other
    providers without code changes.
  icon: 🔄
---
