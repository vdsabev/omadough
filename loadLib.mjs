// QML libraries have no exports. Strip the pragma, evaluate the source, and
// pull the requested names out of the module scope.
import { readFileSync } from "node:fs"

export function loadLib(file, names) {
  const src = readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(".pragma library", "")
  return new Function(src + `\nreturn { ${names.join(", ")} }`)()
}
