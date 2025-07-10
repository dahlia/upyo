/**
 * The priority levels for email messages.
 */
export type Priority = "high" | "normal" | "low";

/**
 * Compares two priority levels and returns a number indicating their
 * relative order.
 *
 * @example Sorting priorities
 * ```ts
 * import { comparePriority, type Priority } from "@upyo/core/priority";
 * const priorities: Priority[] = ["normal", "low", "high"];
 * priorities.sort(comparePriority);
 * console.log(priorities); // ["high", "normal", "low"]
 * ```
 *
 * @param a The first priority to compare.
 * @param b The second priority to compare.
 * @return A negative number if `a` is less than `b`, a positive number
 *         if `a` is greater than `b`, and zero if they are equal.
 */
export function comparePriority(a: Priority, b: Priority): number {
  return a === b
    ? 0
    : a === "high"
    ? -1
    : b === "high"
    ? 1
    : a === "low"
    ? 1
    : -1;
}
