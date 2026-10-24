// Render a saved interview time in the viewer's browser time zone.
// The saved date, wall-clock time and IANA zone remain the source of truth.
// Reject unresolvable wall-clock times rather than showing an invented conversion.
type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

function wallTimeAt(instant: number, zone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute,
  };
}

export function interviewTimeInBrowser(
  scheduledDate: string | null, scheduledTime: string | null, timeZone: string | null,
): string | null {
  if (!scheduledDate || !scheduledTime || !timeZone) return null;
  try {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === timeZone) return null;
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const [hour, minute] = scheduledTime.split(':').map(Number);
    const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
    if (!Number.isFinite(wallUtc)) return null;

    // Iterate the source-zone offset, since the UTC guess may cross a DST boundary.
    let instant = wallUtc;
    for (let i = 0; i < 4; i++) {
      const wall = wallTimeAt(instant, timeZone);
      const offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - instant;
      instant = wallUtc - offset;
    }
    const actual = wallTimeAt(instant, timeZone);
    if (actual.year !== year || actual.month !== month || actual.day !== day ||
        actual.hour !== hour || actual.minute !== minute) return null;
    return new Intl.DateTimeFormat(undefined, {
      timeZone: browserZone, year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(instant));
  } catch {
    return null;
  }
}
