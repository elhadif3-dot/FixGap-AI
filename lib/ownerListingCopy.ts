export function isHebrewOwnerDescription(copy: string): boolean {
  const hebrewLetters = (copy.match(/[\u05d0-\u05ea]/g) ?? []).length;
  const latinLetters = (copy.match(/[A-Za-z]/g) ?? []).length;
  if (hebrewLetters < 40 || hebrewLetters <= latinLetters) return false;

  return !copy.split(/[.!?\n]+/).some((sentence) =>
    !/[\u05d0-\u05ea]/.test(sentence) && (sentence.match(/[A-Za-z]+/g) ?? []).length >= 6
  );
}

export function hasNearbyPlaceName(copy: string, places: Array<{ name: string }>): boolean {
  const lower = copy.toLocaleLowerCase();
  return places.some((place) => place.name.length >= 4 && lower.includes(place.name.toLocaleLowerCase()));
}

export function hasRepeatedNearbyPlace(copy: string, places: Array<{ name: string }>): boolean {
  const lower = copy.toLocaleLowerCase();
  return places.some((place) => {
    const name = place.name.toLocaleLowerCase();
    return name.length >= 4 && lower.indexOf(name) !== lower.lastIndexOf(name);
  });
}

export function labelMentionedNearbyPlaces(
  copy: string,
  places: Array<{ name: string; category_hebrew: string }>
): string {
  let result = copy;
  for (const place of places) {
    if (!place.name || !place.category_hebrew) continue;
    const position = result.toLocaleLowerCase().indexOf(place.name.toLocaleLowerCase());
    if (position < 0) continue;
    const afterName = position + place.name.length;
    if (result.slice(afterName, afterName + 50).includes(place.category_hebrew)) continue;
    const following = result.slice(afterName);
    const existingDetails = following.match(/^(\s*)\(/);
    result = existingDetails
      ? `${result.slice(0, afterName)}${existingDetails[1]}(${place.category_hebrew}; ${following.slice(existingDetails[0].length)}`
      : `${result.slice(0, afterName)} (${place.category_hebrew})${following}`;
  }
  return result;
}
