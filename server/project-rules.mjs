export function canPersistConnection(from, to) {
  if (!from || !to || from.type === "group" || to.type === "group")
    return false;
  if (from.type === "config" && to.type === "config") return false;
  return true;
}
