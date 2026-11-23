import type { Params } from "./i18n/core";

/** A user-facing error. `message` is a Russian template; params fill {placeholders}. */
export class FormError extends Error {
  params?: Params;
  constructor(message: string, params?: Params) {
    super(message);
    this.params = params;
  }
}
