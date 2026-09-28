import type { ExecuteResponse } from "@/lib/types";

function topicLabel(topic: string): string {
  if (/[\u0590-\u05FF]/.test(topic)) return topic;
  const topics: Array<[RegExp, string]> = [[/wifi|internet/i, "חיבור לאינטרנט"], [/noise|loud/i, "רעש ושינה"],
    [/clean|dirty/i, "ניקיון"], [/stair|lift|elevator|access/i, "נגישות והגעה"],
    [/space|small|luggage/i, "מרחב ואחסון"], [/temperature|heating|cold|hot|air conditioning/i, "טמפרטורה ואוורור"],
    [/bed|sleep|comfort/i, "נוחות ושינה"], [/staff|service|check.in/i, "שירות וקבלת אורחים"]];
  return topics.find(([pattern]) => pattern.test(topic))?.[1] ?? "שיפור חוויית האורחים";
}

export function ownerResponseInHebrew(result: ExecuteResponse): string | null {
  if (result.status === "error") return result.response;
  const coverage = ownerReviewCoverage(result);
  const withCoverage = (message: string) => coverage ? `${message}\n\n${coverage}` : message;
  if (result.manager_recommendations?.length) {
    return withCoverage(["המלצות לשיפור הנכס על סמך ביקורות האורחים. תיאור המודעה לא נערך במסלול זה.",
      ...result.manager_recommendations.map((item, index) =>
        `${index + 1}. ${topicLabel(item.topic)}\n${item.guestSignal}\nמה כדאי לעשות: ${item.suggestedAction}\nלמה זה חשוב: ${item.businessValue}\n${item.evidenceCount} איתותי ביקורות במנגנון ההמלצות הקיים.`)].join("\n\n"));
  }
  if (result.evidence_report) return withCoverage(`נאספו ${result.evidence_report.matchingEvidenceCount} דוגמאות בנושא ${topicLabel(result.evidence_report.topic)} מתוך ${result.evidence_report.retrievedReviewCount} ביקורות שאוחזרו. המודעה לא נערכה. מדובר בראיות נבחרות, לא באומדן השכיחות בקרב כל האורחים.`);
  if (result.page_update?.status === "executed") {
    const supervisor = result.steps.map((step) => step.response as { rationale?: unknown }).reverse()
      .find((response) => typeof response?.rationale === "string" && /[\u0590-\u05FF]/.test(response.rationale as string));
    return withCoverage(["העדכון אושר ובוצע בתיאור המודעה המדומה בלבד.",
      typeof supervisor?.rationale === "string" ? supervisor.rationale : "העדכון נשען על המקורות והבדיקות של מסלול הבעלים.",
      "ביקורות המקור, הנתונים וחשבון Airbnb אמיתי לא שונו."].join("\n\n"));
  }
  if (result.portfolio_update) return `הטיפול הסתיים: ${result.portfolio_update.executed} מודעות מדומות עודכנו ו־${result.portfolio_update.skipped} נשארו ללא שינוי. נתוני המקור לא נערכו.`;
  if (result.steps.some((step) => (step.response as { in_scope?: unknown })?.in_scope === false)) {
    return "הבקשה מחוץ לתחום של הסוכן. אפשר לבדוק פערים במודעת הנכס מול ביקורות אורחים, להציע שיפורים לנכס או לעדכן תיאור מדומה. לא בוצעו קריאות מודל עבור בקשה זו.";
  }
  // Deterministic refusals remain model-free and do not imply a successful edit.
  return withCoverage("הבקשה הסתיימה ללא שינוי במודעה. ניתן לבדוק פערים מול ביקורות, לקבל המלצות לשיפור הנכס או לערוך את תיאור המודעה המדומה בלבד.");
}

function ownerReviewCoverage(result: ExecuteResponse): string | null {
  const reviewStep = [...result.steps].reverse().find((step) => {
    const response = step.response as Record<string, unknown> | null;
    return response && typeof response.coverage_covered_after_count === "number";
  });
  const response = reviewStep?.response as Record<string, unknown> | undefined;
  if (!response) return null;
  const checked = Number(response.coverage_covered_after_count);
  const total = Number(response.coverage_total_reviews_in_scope);
  const size = Number(response.coverage_window_size);
  const newlyChecked = Number(response.coverage_new_reviews_count);
  if (![checked, total, size, newlyChecked].every(Number.isFinite) || total <= 0 || size <= 0) return null;
  const previous = Number(response.coverage_previously_covered_count ?? checked - newlyChecked);
  const window = Math.max(1, Math.floor(previous / size) + 1);
  const totalWindows = Math.ceil(total / size);
  return `חלון ביקורות ${window} מתוך ${totalWindows} · ${newlyChecked} ביקורות בחלון הנוכחי · התקדמות ${checked} מתוך ${total}${response.coverage_complete === true ? " · כל החלונות הושלמו" : ""}.`;
}
