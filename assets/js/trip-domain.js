/**
 * MarkiCab Trip Domain Logic
 * Pure trip-domain operations — no DOM access, no API calls, no state mutation.
 * Extracted from trip-planner.html — no behavior change.
 *
 * Dependencies:
 *   - window.state (read-only for getTrip)
 */
(function (root, factory) {
  const domain = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = domain;
  }
  if (typeof window !== 'undefined') {
    window.TripDomain = domain;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.TripDomain = domain;
  }
})(this, function () {
  'use strict';

  /**
   * Determine trip status based on dates.
   * @param {object} trip - Trip object with start/end dates
   * @returns {[string, string]} - [status, label] pair
   */
  function tripStatus(trip) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!trip.start) return ['planned', 'Rencana'];
    if (!trip.end) return ['planned', 'Rencana'];
    const start = new Date(trip.start + 'T00:00:00');
    start.setHours(0, 0, 0, 0);
    const end = new Date(trip.end + 'T00:00:00');
    end.setHours(0, 0, 0, 0);
    if (today > end) return ['past', 'Selesai'];
    if (today >= start) return ['active', 'Berlangsung'];
    return ['upcoming', 'Mendatang'];
  }

  /**
   * Get the currently active trip.
   * @returns {object|null} - Active trip or null
   */
  function getTrip() {
    return state.readOnlyTrip || state.trips.find(t => t.id === state.activeTripId);
  }

  return {
    tripStatus,
    getTrip
  };
});
