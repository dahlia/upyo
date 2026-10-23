 -  Added *@upyo/cloudflare*, a transport for the Cloudflare Email Service
    REST API.  It supports display names on every address, attachments,
    inline images, calendar invitations, and custom headers, and retries
    requests that Cloudflare answers with `429` or a `5xx` status.  Headers
    that Cloudflare controls and messages with more than 50 recipients are
    rejected before sending with a `CloudflareValidationError`.  [[#1]]
