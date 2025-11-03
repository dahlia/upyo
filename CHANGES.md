Upyo changelog
==============

Version 0.1.2
-------------

Released on Nowember 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]

[#14]: https://github.com/dahlia/upyo/issues/14


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
