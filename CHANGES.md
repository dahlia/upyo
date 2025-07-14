Upyo changelog
==============

Version 0.2.0
-------------

To be released.

### @upyo/ses

 -  Added Amazon SES transport.  [[#3]]

     -  Added `SesTransport` class.
     -  Added `SesConfig` interface.
     -  Added `SesAuthentication` interface.

[#3]: https://github.com/dahlia/upyo/issues/3


Version 0.1.1
-------------

Released on July 14, 2025.

### @upyo/smtp

 -  Fixed CJK character encoding corruption in SMTP transport HTML emails.
    Korean, Japanese, and Chinese characters are now properly encoded using
    UTF-8 quoted-printable encoding.  [[#4]]

[#4]: https://github.com/dahlia/upyo/issues/4


Version 0.1.0
-------------

Initial release.  Released on July 13, 2025.
