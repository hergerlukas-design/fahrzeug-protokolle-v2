import type { CalendarEvent, TransferCalendarLink } from './transfers'

/** Ein Kalendertermin mit sinnvollen Vorgaben – Tests nennen nur, worauf es ankommt. */
export function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, 'uid' | 'summary' | 'date_from'>): CalendarEvent {
  return {
    description: null,
    location: null,
    date_to: null,
    time_from: null,
    time_to: null,
    all_day: true,
    recurring: false,
    ...overrides,
  }
}

/** Der Schnappschuss eines übernommenen Termins. */
export function link(overrides: Partial<TransferCalendarLink> = {}): TransferCalendarLink {
  return {
    calendar_uid: 'uid-1',
    summary: 'Lynk 08 WI-L 8957E in München',
    date_from: '2026-11-02',
    date_to: '2026-11-09',
    time_from: null,
    time_to: null,
    location: 'München',
    description: 'Notiz',
    ...overrides,
  }
}
