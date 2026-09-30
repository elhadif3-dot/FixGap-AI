"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, MapPin, MinusCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import type { GuestAssessmentResult } from "@/lib/guestAssessment";
import type { AgentStep } from "@/lib/types";
import { AgentTrace } from "@/components/AgentTrace";

const categoryNames: Record<string, string> = {
  Dining: "אוכל", Culture: "תרבות", Parks_Recreation: "פנאי", Nightlife: "חיי לילה",
  Wellness_Lifestyle: "כושר ורווחה", Work_Infrastructure: "שירותים ותשתיות"
};
const alignmentNames: Record<string, string> = {
  supports: "תומך בתיאור", contradicts: "פער מול התיאור", mixed: "עדויות מעורבות",
  no_claim: "מידע נוסף מהאורחים", not_verified: "לא ניתן לאמת"
};
const signalTopicNames: Record<string, string> = {
  location: "מיקום ונגישות ברגל", cleanliness: "ניקיון", noise: "רעש ושקט", service: "צוות ושירות",
  checkin: "הגעה וצ'ק-אין", comfort: "נוחות ומיטה", wifi: "Wi-Fi", accuracy: "דיוק המודעה",
  value: "תמורה למחיר", property_quality: "איכות החדר", safety: "בטיחות"
};

export function GuestAssessmentPanel({ listingId, sessionId }: { listingId: string; sessionId: string }) {
  const [result, setResult] = useState<GuestAssessmentResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [debugSteps, setDebugSteps] = useState<AgentStep[]>([]);
  const active = useRef(false);
  const continuation = useRef<string | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const version = requestVersion.current;
    void fetch(`/api/guest_assessment?listing_id=${encodeURIComponent(listingId)}&session_id=${encodeURIComponent(sessionId)}`,
      { signal: controller.signal }).then((response) => response.json()).then((data) => {
        if (!controller.signal.aborted && version === requestVersion.current && !active.current && data.status === "ok") {
          setResult(data.result ?? null);
          setDebugSteps(data.result?.steps ?? []);
        }
      }).catch(() => {});
    return () => controller.abort();
  }, [listingId, sessionId]);
  async function run() {
    if (active.current) return;
    active.current = true; requestVersion.current++; setRunning(true); setError(""); setDebugSteps([]);
    try {
      const response = await fetch("/api/guest_assessment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId, session_id: sessionId,
          ...(continuation.current ? { continuation: continuation.current } : {}) }),
        signal: AbortSignal.timeout(240_000)
      });
      const data = await response.json();
      setDebugSteps(Array.isArray(data.steps) ? data.steps : data.result?.steps ?? []);
      if (!response.ok || data.status !== "ok") throw new Error(data.error || "הניתוח לא הושלם.");
      continuation.current = typeof data.continuation === "string" ? data.continuation : null;
      setResult(data.result);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "הניתוח לא הושלם.");
    } finally { active.current = false; setRunning(false); }
  }
  const assessment = result?.assessment;
  const complete = result && Number(result.retrieval_audit.remaining_source_reviews) === 0;
  return (
    <section className="guestAssessment" dir="rtl" aria-label="הערכת הנכס לאורח">
      <div className="guestAssessmentHeader">
        <div><span className="guestEyebrow">FixGap AI</span><h2>Guest Agent</h2></div>
        <button className="primaryButton" type="button" disabled={running || Boolean(complete)} onClick={() => void run()}>
          {running ? "Analyzing..." : complete ? "No more source windows" : result ? "Update assessment" : "Analyze property"}<ArrowRight size={17} />
        </button>
      </div>
      {running ? <div className="guestProgress" role="status"><span />אוסף עדויות, מנתח ובודק את המסקנות</div> : null}
      {error ? <p className="guestError" role="alert"><TriangleAlert size={18} />{error}</p> : null}
      {result && assessment ? <>
        <div className="guestReportMeta">
          <span><ShieldCheck size={16} />Latest window verified</span>
          <span>Window {Number(result.retrieval_audit.source_window_index ?? 0) + 1} · {Number(result.retrieval_audit.source_window_count ?? result.evidence.length)} source reviews</span>
          <span>{result.evidence.length} source reviews used across updates</span>
          <span>{result.places.length} nearby places</span>
        </div>
        <p className="guestSummary">{assessment.summary}</p>
        {result.updates?.some((update) => update.relationship === "contradicts") ?
          <p className="guestContradictionNotice">נוספו עדויות שסותרות חלק מהממצאים הקודמים. הסיכום המקורי נשמר לצורך מעקב; יש לקרוא גם את העדכונים המסומנים בהמשך.</p> : null}
        <div className="guestFindings">
          {assessment.findings.map((finding) => <article className={`guestFinding ${finding.kind}`} key={finding.id}>
            <div className="guestFindingTitle">
              {finding.kind === "strength" ? <CheckCircle2 size={21} /> : finding.kind === "drawback" ? <MinusCircle size={21} /> : <TriangleAlert size={21} />}
              <h3>{finding.title}</h3>
            </div>
            <p>{finding.observation}</p>
            {finding.interpretation ? <p className="guestInterpretation">{finding.interpretation}</p> : null}
            {result.updates?.filter((update) => update.finding_id === finding.id).map((update, index) =>
              <div className={`guestFindingUpdate ${update.relationship}`} key={`${update.window_index}-${index}`}>
                <strong>{update.relationship === "contradicts" ? "עדות סותרת חדשה" : update.relationship === "supports" ? "ראיות תומכות נוספות" : "הקשר נוסף"}</strong>
                <p>{update.finding.observation}</p>
                <p>{update.finding.interpretation}</p>
                <details><summary>{update.window_index === Number(result.retrieval_audit.source_window_index ?? 0) ? "New evidence" : "Evidence"}<ChevronDown size={14} /></summary>
                  {update.finding.evidence.map((ref) => <blockquote dir="auto" key={ref.id}>{ref.quote}</blockquote>)}
                </details>
              </div>)}
            <div className="guestFindingMeta"><span>{alignmentNames[finding.alignment]}</span>
              {result.signal_counts?.[finding.id]?.length ? result.signal_counts[finding.id].map((count) => <span key={count.topic_id}>
                {signalTopicNames[count.topic_id] ?? count.topic_label}: {count.supporting} מתוך {count.analyzed} ביקורות שנבדקו תואמות
              </span>) : <span>{result.support_counts[finding.id]} ביקורות מצוטטות כתמיכה</span>}
              <span>{result.support_counts[finding.id]} ציטוטים מייצגים ומאומתים</span></div>
            <details><summary>Evidence &amp; listing comparison<ChevronDown size={14} /></summary>
              {finding.listing_claim ? <div className="guestListingClaim"><strong>המודעה מציגה</strong><blockquote dir="auto">{finding.listing_claim}</blockquote></div> : null}
              {finding.evidence.map((ref) => {
                const source = result.evidence.find((item) => item.id === ref.id);
                return <div className="guestQuote" key={ref.id}><blockquote dir="auto">{ref.quote}</blockquote>
                  <small>ביקורת {source?.review_id} · {source?.date}{source?.is_excerpt ? " · קטע מביקורת" : ""}</small></div>;
              })}
            </details>
          </article>)}
        </div>
        <section className="guestNeighborhood"><h3><MapPin size={20} />הסביבה כחלק מהשהייה</h3>
          <p>{assessment.neighborhood.summary}</p>
          <div className="guestPlaces">{result.places.filter((place) => assessment.neighborhood.place_ids.includes(place.id)).map((place) =>
            <a key={place.id} href={place.url} target="_blank" rel="noreferrer">
              <strong dir="auto">{place.name}</strong><span>{categoryNames[place.category] || place.category}</span>
              <small>{place.rating ?? "ללא דירוג"} · {place.reviews} ביקורות · {place.straight_line_distance_km} ק״מ בקו אווירי</small>
            </a>)}</div>
        </section>
        {assessment.guest_fit.length ? <section className="guestFit"><h3>למי זה עשוי להתאים?</h3>
          {assessment.guest_fit.map((fit) => <div key={fit.audience}><strong>{fit.audience}</strong><p>{fit.explanation}</p></div>)}
        </section> : null}
        {assessment.questions.length ? <section className="guestQuestions"><h3>כדאי לברר לפני ההזמנה</h3>
          <ul>{assessment.questions.map((question) => <li key={question}>{question}</li>)}</ul></section> : null}
        <details className="guestMethod"><summary>Sources &amp; methodology<ChevronDown size={15} /></summary>
          <p>ההערכה מבוססת על דאטה שמור ומדגם נבחר, לא בדיקה בזמן אמת או מדגם מייצג של כלל האורחים.</p>
          <p>כל עדכון מתקדם לחלון הבא של עד 200 ביקורות שמישות, מהחדשות לישנות. הממצאים הקודמים נשמרים ותוספות או סתירות מסומנות בנפרד. רק קטעים נבחרים מועברים למודל; לא כל ביקורת בחלון עברה ניתוח סמנטי מלא.</p>
          <p>מספר הביקורות התואמות נספר בקוד על כל ביקורות המקור בחלונות שנבדקו, לפי נושא וקוטביות. הציטוטים המוצגים הם דוגמאות מאומתות בלבד; כשלא ניתן למפות ממצא לנושא באופן חד-משמעי, מוצג רק מספר הציטוטים ולא אומדן כולל.</p>
          <p>{Number(result.retrieval_audit.analyst_passage_count ?? result.evidence.length)} קטעי מקור · כ־{Number(result.retrieval_audit.estimated_evidence_tokens ?? 0).toLocaleString("he-IL")} טוקנים מוערכים בחבילת הביקורות. השימוש בפועל מופיע בקריאות המודל להלן.</p>
          <p>האחזור משתמש בווקטורים קיימים של ביקורות לדוגמה. הוא אינו חיפוש באמצעות embedding חדש של שאילתת טקסט.</p>
          {assessment.omitted_findings.map((item) => <p key={item.topic}><strong>לא נכלל: {item.topic}.</strong> {item.reason}</p>)}
        </details>
      </> : null}
      {debugSteps.length ? <details className="guestMethod" open={Boolean(error)}>
        <summary>LLM Steps &amp; Debug<ChevronDown size={15} /></summary>
        <AgentTrace steps={debugSteps} title="Latest run" />
      </details> : null}
    </section>
  );
}
