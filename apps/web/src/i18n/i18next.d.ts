import "i18next";

import type { Resource } from "./en";

// Keys passed to `t` are checked against the English strings.
declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: Resource };
  }
}
