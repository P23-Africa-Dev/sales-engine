export function getCurrentDateParts() {
  const now = new Date();
  return {
    day: now.getDate(),
    weekDay: now.toLocaleDateString("en-US", { weekday: "long" }),
    month: now.toLocaleDateString("en-US", { month: "long" }),
  };
}
