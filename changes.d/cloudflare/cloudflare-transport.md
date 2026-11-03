 -  Added *@upyo/cloudflare*, with two transports for Cloudflare Email Service:
    `CloudflareTransport`, which sends through the REST API from any runtime,
    and `CloudflareWorkerTransport`, which sends through a `send_email`
    binding on Cloudflare Workers.  Both support display names on every
    address, attachments, inline images, calendar invitations, and custom
    headers, and retry rate limits and server errors with backoff.  Headers
    that Cloudflare controls and messages with more than 50 recipients fail
    before sending, with a validation receipt that names the problem.
    [[#1], [#78] by sykezz]
