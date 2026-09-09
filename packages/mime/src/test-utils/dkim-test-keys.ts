/**
 * Test key pairs for DKIM signing tests.
 *
 * WARNING: These keys are for testing purposes only.
 * Never use these keys in production environments.
 */

// =============================================================================
// RSA Keys (2048-bit)
// =============================================================================

/**
 * Test RSA private key in PKCS#8 PEM format (2048-bit).
 * For testing DKIM signing functionality only.
 */
export const TEST_DKIM_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCqNgoqaoK/hCH3
BT9TeS2qxBjX18I1oBDEM2LuwI615Nt0QPicVYzW9pYeISfGgcBE4gDhszGvN+6g
GAO/sdmzXlqPLupDeuV++RyjVSFlFJphN+MYVedaFeIzmY+5ryxtYl4BJBOKNdxp
cgte1dgRLEjT5VRCoUxgFgGYZa6PL5zglnEHiU6Girt+7Xl3hbUMM2p1BvkNoUlu
D4BCgHeeJwoF+eNBMiXpJRhqH3HPJosYNgZSpnsqEzeqRSjWk8aV+UwMfbFA8gXG
DMuyyGSxmNrPKg+gM2SEc4UPJccLe0AzKj3YSjKWfiSbmsAZcIPIXh7c+t/4Qi49
Dzhck5DPAgMBAAECggEAAcMrjp9CZbK25BXYekgNu5KRroNfvhG1j6gLeez/VKsy
2IGnQBskqTfBaBVNuXmSOWu/VjR2b+OqtzOREcE/GDvbI1e0SLe9FNCtbTHTRIB5
Jh/avul9txj1SzWO8ziCw5kuBv86SLhqR3uIKP4G15XBTKxe8CtesLs8D9cWnDD9
2LK988qOBA/7zJoluLtKIGj3Iff5cjBFByCTKBKR9V97Z5GoUOB+dWtLFSnccFWY
54LapDGnXBavadhsXWbTO5uTr0ElL0/5imBXz4i7dp246JDYAaWCxgEbXm4SsW3O
Cez9Dx+uJy8IyHbAgGc3gTalsFrr8GXTkiqiZeffAQKBgQDuhzpYuJBwgBGUlWpZ
WmhhKHmwDE1D3h+HYy9ncVwC36WWWUmWe1xRr9DI8Y2Bw858soirJRwPc0e8C/ql
JbKG1XEBp2X6tmgt4oR5noCZrq+QaFJBl9jL8bME1PZ5DH3jttIH8MTLBTjv5Kzl
oxbwfKItvKwVlp5bHX7Sra8/zwKBgQC2rcKUkvpVQNjiFn+1pDaG6yJqjnCnLhN5
DXLNVp8Y7oqtVSQTOkb3rPdQrVXMczjT5T0bdfq48kiO7yE9vwcrxKNQZKJsLcnQ
u8aG6biNHGD9KGmwrrvMt2ubbyOiv42AVwsnVmc/+jkaQ3W1hPOeidK6/QzgbqRu
cOb38YHfAQKBgQCeCd7wtaiNwWzkg3LpLOuHpCesKxpuYxeEvoTEBumtxbyStyn4
mFd8j/7HhLP7TF7dY/UFYBsNaZYX0+AH18hHadfr/puk14KDFFgttIUETidoiJYn
e5Ja3hN8mhWL8mjenVzfgfkBgr5Mw7iCleI3CHzzzNQ/oYHeYNaMhCNfJQKBgE/c
AlZFMp6WbLnZsBbOJPAyVqdSgbj0EZs339oYZhDWJ1XDBLRLI78epDdmrz1jmZI4
gtBAcUzszf9+Vn/RxObDXcnFVKQKGFHh5NYR0pYNs/C3/Aw7Nuo1vRsEKQX6y3cx
ljSqNxTm5JOwrgKejoneInuQKFLsy4FkZfQ6ZdYBAoGBAIWidb2aBSzwNvyqsLSE
ld/sIMSUZs55elni/PYIVoVsucwi64RAf2Yp9CqxM2dY2B/tOaU8ZM8Ih7UBzpwG
syOX7b1HHQ92Vc1Oq0qRkqh+FaAmCNfuitU+YvoRSXUkwoS4bAJgt7vUUZyVUBrY
k2/wS0OnfGTaP+Ycq4Mz5+9S
-----END PRIVATE KEY-----`;

/**
 * Test RSA public key in PEM format (2048-bit).
 * Corresponds to TEST_DKIM_PRIVATE_KEY.
 */
export const TEST_DKIM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqjYKKmqCv4Qh9wU/U3kt
qsQY19fCNaAQxDNi7sCOteTbdED4nFWM1vaWHiEnxoHAROIA4bMxrzfuoBgDv7HZ
s15ajy7qQ3rlfvkco1UhZRSaYTfjGFXnWhXiM5mPua8sbWJeASQTijXcaXILXtXY
ESxI0+VUQqFMYBYBmGWujy+c4JZxB4lOhoq7fu15d4W1DDNqdQb5DaFJbg+AQoB3
nicKBfnjQTIl6SUYah9xzyaLGDYGUqZ7KhM3qkUo1pPGlflMDH2xQPIFxgzLsshk
sZjazyoPoDNkhHOFDyXHC3tAMyo92Eoyln4km5rAGXCDyF4e3Prf+EIuPQ84XJOQ
zwIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Test domain for DKIM signing.
 */
export const TEST_DKIM_DOMAIN = "test.example.com";

/**
 * Test selector for DKIM signing.
 */
export const TEST_DKIM_SELECTOR = "test2025";

// =============================================================================
// Ed25519 Keys
// =============================================================================

/**
 * Test Ed25519 private key in PKCS#8 PEM format.
 * For testing DKIM signing functionality only.
 */
export const TEST_DKIM_ED25519_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHrEIaq5WKCJ5bo54PO3KNnCw7lvWx9ZC1p0q2SRY/7O
-----END PRIVATE KEY-----`;

/**
 * Test Ed25519 public key in PEM format.
 * Corresponds to TEST_DKIM_ED25519_PRIVATE_KEY.
 */
export const TEST_DKIM_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAYFNLXjz1u/YHsmLd15UAoGdOquVBRCDEQxfi6PmoPkE=
-----END PUBLIC KEY-----`;

/**
 * Test selector for Ed25519 DKIM signing.
 */
export const TEST_DKIM_ED25519_SELECTOR = "ed25519-test2025";
