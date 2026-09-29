import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv, rowsToObjects } from "@/lib/csv";
import type { Listing, Place, Review } from "@/lib/types";

type LocalAnalyticsData = {
  listings: Listing[];
  reviews: Review[];
  places: Place[];
};

let cache: Promise<LocalAnalyticsData> | null = null;

function numberValue(value: string): number | null {
  const parsed = Number(value.replace("$", "").replace(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: string): string {
  return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function amenities(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function loadLocalAnalyticsData(): Promise<LocalAnalyticsData> {
  if (!cache) {
    const dataDir = path.join(process.cwd(), "data");
    cache = Promise.all([
      readFile(path.join(dataDir, "lisbon_listings_final_with_pois.csv"), "utf8"),
      readFile(path.join(dataDir, "lisbon_reviews_final_with_pois.csv"), "utf8"),
      readFile(path.join(dataDir, "lisbon_google_places_filtered.csv"), "utf8")
    ]).then(([listingCsv, reviewCsv, placeCsv]) => ({
      listings: rowsToObjects(parseCsv(listingCsv)).map((row) => ({
        id: row.id,
        name: cleanText(row.name),
        description: cleanText(row.description),
        neighbourhood: row.neighbourhood_cleansed,
        latitude: numberValue(row.latitude) ?? 0,
        longitude: numberValue(row.longitude) ?? 0,
        propertyType: row.property_type,
        roomType: row.room_type,
        accommodates: numberValue(row.accommodates) ?? 0,
        bathroomsText: row.bathrooms_text,
        bedrooms: numberValue(row.bedrooms),
        beds: numberValue(row.beds),
        amenities: amenities(row.amenities),
        price: row.price || "N/A",
        reviewScore: numberValue(row.review_scores_rating),
        locationScore: numberValue(row.review_scores_location),
        valueScore: numberValue(row.review_scores_value),
        numberOfReviews: numberValue(row.number_of_reviews) ?? 0,
        nearbyPlacesCount: numberValue(row.nearby_places_count) ?? 0
      })),
      reviews: rowsToObjects(parseCsv(reviewCsv)).flatMap((row) => {
        const comments = cleanText(row.comments);
        return row.listing_id && row.id && comments
          ? [{ listingId: row.listing_id, id: row.id, date: row.date, comments }]
          : [];
      }),
      places: rowsToObjects(parseCsv(placeCsv)).flatMap((row) => {
        if (!row.place_name || !row.lat || !row.long) return [];
        return [{
          url: row.url,
          placeName: cleanText(row.place_name),
          category: row.category,
          rating: numberValue(row.rating),
          numberOfReviews: numberValue(row.num_of_reviews) ?? 0,
          reviewsContent: cleanText(row.reviews_content),
          latitude: numberValue(row.lat) ?? 0,
          longitude: numberValue(row.long) ?? 0
        }];
      })
    }));
  }
  return cache;
}

export async function getLocalAnalyticsInputs(listingId: string) {
  const data = await loadLocalAnalyticsData();
  const listing = data.listings.find((item) => item.id === listingId) ?? null;
  if (!listing) return null;
  return {
    listing,
    reviews: data.reviews.filter((review) => review.listingId === listingId),
    places: data.places.map((place) => ({
      ...place,
      distanceKm: haversineKm(listing.latitude, listing.longitude, place.latitude, place.longitude)
    })).filter((place) => place.distanceKm <= 1)
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
