/**
 * @fileoverview Plunk transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * Plunk's HTTP API, supporting both cloud-hosted and self-hosted instances.
 */

export { PlunkTransport } from "./plunk-transport.ts";
export type { PlunkConfig, ResolvedPlunkConfig } from "./config.ts";
export type { PlunkError, PlunkResponse } from "./http-client.ts";
