import type { Place } from "@/lib/types";

export function categoryCounts(places: Place[]): Record<string, number> {
  return places.reduce<Record<string, number>>((counts, place) => {
    counts[place.category] = (counts[place.category] || 0) + 1;
    return counts;
  }, {});
}

export function selectNearbyPlaces(places: Place[], limit: number): Place[] {
  const seen = new Set<string>();
  const remaining = places.filter((place) => {
    const id = `${place.placeName.toLowerCase().trim()}:${place.latitude.toFixed(4)}:${place.longitude.toFixed(4)}`;
    if (seen.has(id) || !Number.isFinite(place.distanceKm) || (place.distanceKm ?? 0) < 0) return false;
    seen.add(id);
    if (/real estate|rental office|vacation rental|apartment rental/i.test(place.placeName)) return false;
    return place.rating === null || place.rating >= 3.8;
  });
  const selected: Place[] = [];
  const score = (place: Place) => {
    const base = (place.rating ?? 3.8) + Math.min(2, Math.log10(place.numberOfReviews + 1) * 0.5)
      - (place.distanceKm ?? 2) * 0.8;
    const categoryPenalty = selected.filter((other) => other.category === place.category).length * 0.45;
    const sameActivity = /escape|puzzle room/i.test(place.placeName)
      ? selected.filter((other) => /escape|puzzle room/i.test(other.placeName)).length * 0.6 : 0;
    return base - categoryPenalty - sameActivity;
  };
  while (remaining.length && selected.length < limit) {
    remaining.sort((a, b) => score(b) - score(a) || a.placeName.localeCompare(b.placeName));
    selected.push(remaining.shift()!);
  }
  return selected;
}
