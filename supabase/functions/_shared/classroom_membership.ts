export interface ClassroomChoice {
  id: string
  name: string
}

export interface ClassroomSelection {
  selected: ClassroomChoice | null
  requiresSelection: boolean
}

/**
 * Resolve the requested classroom against server-owned memberships.
 * A sole membership is safe to auto-correct; multiple memberships require an
 * explicit valid link/choice.
 */
export function resolveClassroomSelection(
  memberships: ClassroomChoice[],
  requestedClassroomId: string | null | undefined,
): ClassroomSelection {
  const requested = (requestedClassroomId || '').trim()
  const exact = requested
    ? memberships.find(classroom => classroom.id.toLocaleLowerCase() === requested.toLocaleLowerCase())
    : undefined
  const selected = exact ?? (memberships.length === 1 ? memberships[0] : null)
  return {
    selected,
    requiresSelection: selected === null && memberships.length > 1,
  }
}
