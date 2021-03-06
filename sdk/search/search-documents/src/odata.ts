// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

function escapeQuotesIfString(input: unknown, previous: string): string | unknown {
  let result = input;

  if (typeof input === "string") {
    result = input.replace(/'/g, "''");
    // check if we need to escape this literal
    if (!previous.trim().endsWith("'")) {
      result = `'${result}'`;
    }
  }
  return result;
}

/**
 * Escapes an odata filter expression to avoid errors with quoting string literals.
 * Example usage:
 * ```ts
 * const baseRateMax = 200;
 * const ratingMin = 4;
 * const filter = odata`Rooms/any(room: room/BaseRate lt ${baseRateMax}) and Rating ge ${ratingMin}`;
 * ```
 * For more information on supported syntax see: https://docs.microsoft.com/en-us/azure/search/search-query-odata-filter
 * @param strings
 * @param values
 */
export function odata(strings: TemplateStringsArray, ...values: unknown[]): string {
  const results = [];
  for (let i = 0; i < strings.length; i++) {
    results.push(strings[i]);
    if (i < values.length) {
      results.push(escapeQuotesIfString(values[i], strings[i]));
    }
  }
  return results.join("");
}
