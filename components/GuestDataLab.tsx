"use client";

import { useEffect, useState } from "react";
import { BarChart3, ChevronDown, Database, MapPin, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import type { GuestDataAnalysis } from "@/lib/guestDataAnalysis";

const resultNames: Record<string, string> = {
  supported: "Supported",
  possible_gap: "Possible gap",
  unmentioned_strength: "Unmentioned strength",
  insufficient: "Not enough evidence"
};

const categoryNames: Record<string, string> = {
  Dining: "Dining", Culture: "Culture", Parks_Recreation: "Parks & recreation", Nightlife: "Nightlife",
  Wellness_Lifestyle: "Wellness & lifestyle", Work_Infrastructure: "Work & practical services"
};

export function GuestDataLab({ listingId }: { listingId: string }) {
  const [analysis, setAnalysis] = useState<GuestDataAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function run(signal?: AbortSignal) {
    setRunning(true); setError("");
    try {
      const response = await fetch(`/api/guest_data_analysis?listing_id=${encodeURIComponent(listingId)}`, { signal });
      const payload = await response.json();
      if (!response.ok || payload.status !== "ok") throw new Error(payload.error || "Data analysis failed.");
      setAnalysis(payload.analysis);
      setElapsedMs(Number(payload.performance?.elapsedMs ?? 0));
    } catch (problem) {
      if (problem instanceof DOMException && problem.name === "AbortError") return;
      setError(problem instanceof Error ? problem.message : "Data analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setAnalysis(null); setElapsedMs(null);
    void run(controller.signal);
    return () => controller.abort();
    // `listingId` is the only input; `run` intentionally starts one request per selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const visibleTopics = analysis?.topics.slice(0, 9) ?? [];
  const maxMentions = Math.max(1, ...visibleTopics.map((topic) => topic.mentionedReviews));
  const maxCategory = Math.max(1, ...(analysis?.nearby.categories.map((category) => category.count) ?? []));
  return (
    <section className="dataLab" aria-labelledby="data-lab-title">
      <div className="dataLabHeader">
        <div>
          <span className="dataLabEyebrow"><Database size={15} />Guest Data Lab</span>
          <h2 id="data-lab-title">Review Intelligence</h2>
          <p>Instant, deterministic intelligence over every bundled review and the surrounding-place dataset.</p>
        </div>
        <button className="primaryButton" type="button" onClick={() => void run()} disabled={running}>
          <RefreshCw className={running ? "dataLabSpin" : ""} size={17} />
          {running ? "Scanning full corpus..." : "Refresh intelligence"}
        </button>
      </div>
      {error ? <p className="dataLabError" role="alert"><TriangleAlert size={18} />{error}</p> : null}
      {!analysis && running ? <div className="dataLabEmpty" role="status">
        <BarChart3 size={24} /><p>Scanning the full review corpus, ranking signals, and measuring neighborhood gravity…</p>
      </div> : null}
      {analysis ? <>
        <div className="dataLabCoverage">
          <div><strong>{analysis.coverage.reviewsAnalyzed.toLocaleString()}</strong><span>reviews analyzed</span></div>
          <div><strong>{analysis.coverage.reviewsWithSignals.toLocaleString()}</strong><span>reviews with measured signals</span></div>
          <div><strong>{analysis.coverage.dateFrom ?? "N/A"}</strong><span>first dated review</span></div>
          <div><strong>{analysis.coverage.dateTo ?? "N/A"}</strong><span>latest dated review</span></div>
        </div>
        <p className="dataLabScope">Full source corpus: {analysis.coverage.reviewsAnalyzed} cleaned unique reviews from {analysis.coverage.reviewsAvailable} available rows. Counts represent reviews, not keyword occurrences.</p>
        <div className="signalDeck" aria-label="Strongest ranked signals">
          {analysis.rankedSignals.slice(0, 6).map((signal, index) => <article className={`signalCard ${signal.kind}`} key={signal.id}>
            <div><span>#{index + 1} · {signal.kind}</span><b>{signal.score}</b></div>
            <h3>{signal.title}</h3><p>{signal.summary}</p>
            <small>{signal.confidence} confidence · {signal.evidenceCount} evidence records</small>
          </article>)}
        </div>

        <div className="dataLabGrid">
          <section className="dataViz" aria-labelledby="topic-balance-title">
            <div className="dataVizHeading"><div><span>01</span><h3 id="topic-balance-title">What shapes the guest experience?</h3></div><p>Positive and negative review signals by topic</p></div>
            <div className="topicChart">
              {visibleTopics.map((topic) => {
                const width = topic.mentionedReviews / maxMentions * 100;
                const positiveWidth = topic.mentionedReviews ? topic.positiveReviews / topic.mentionedReviews * 100 : 0;
                const negativeWidth = topic.mentionedReviews ? topic.negativeReviews / topic.mentionedReviews * 100 : 0;
                return <div className="topicRow" key={topic.id}>
                  <div className="topicLabel"><strong>{topic.label}</strong><span>{topic.mentionedReviews} reviews · {topic.prevalencePct}%</span></div>
                  <div className="topicTrack" title={`${topic.positiveReviews} positive, ${topic.negativeReviews} negative`}>
                    <div className="topicScale" style={{ width: `${width}%` }}>
                      <span className="topicPositive" style={{ width: `${positiveWidth}%` }} />
                      <span className="topicNegative" style={{ width: `${negativeWidth}%` }} />
                    </div>
                  </div>
                  <div className="topicCounts"><span>{topic.positiveReviews} positive</span><span>{topic.negativeReviews} negative</span></div>
                </div>;
              })}
            </div>
          </section>

          <section className="dataViz" aria-labelledby="recurrence-title">
            <div className="dataVizHeading"><div><span>02</span><h3 id="recurrence-title">Which issues recur?</h3></div><p>Frequency, consistency across months, and recency</p></div>
            {analysis.recurringIssues.length ? <div className="issueChart">
              {analysis.recurringIssues.map((issue) => <div className="issueRow" key={issue.topicId}>
                <div><strong>{issue.label}</strong><span>{issue.negativeReviews} reviews across {issue.monthsWithIssue} months</span></div>
                <div className="issueMeter"><span style={{ width: `${issue.recurrenceScore}%` }} /></div>
                <b>{issue.recurrenceScore}</b>
              </div>)}
            </div> : <p className="dataVizEmpty">No issue reaches the minimum recurring-evidence threshold.</p>}
          </section>

          <section className="dataViz" aria-labelledby="trend-title">
            <div className="dataVizHeading"><div><span>03</span><h3 id="trend-title">Is the experience changing?</h3></div><p>Recent {analysis.coverage.recentReviews} reviews vs {analysis.coverage.historicalReviews} older reviews</p></div>
            {analysis.trends.length ? <div className="trendChart">
              {analysis.trends.map((trend) => {
                const max = Math.max(1, trend.recentRatePct, trend.historicalRatePct);
                return <div className="trendRow" key={`${trend.topicId}-${trend.polarity}`}>
                  <div className="trendTitle"><strong>{trend.label}</strong><span className={`trendDirection ${trend.direction}`}>{trendLabel(trend.polarity, trend.direction)}</span></div>
                  <div className="trendBars">
                    <span>Recent</span><i><b style={{ width: `${trend.recentRatePct / max * 100}%` }} /></i><em>{trend.recentRatePct}%</em>
                    <span>Older</span><i><b className="historical" style={{ width: `${trend.historicalRatePct / max * 100}%` }} /></i><em>{trend.historicalRatePct}%</em>
                  </div>
                </div>;
              })}
            </div> : <p className="dataVizEmpty">There is not enough dated evidence for a stable recent-vs-historical comparison.</p>}
          </section>

          <section className="dataViz" aria-labelledby="expectation-title">
            <div className="dataVizHeading"><div><span>04</span><h3 id="expectation-title">Where do expectations align?</h3></div><p>Exact listing signals compared with measured guest evidence</p></div>
            <div className="expectationTable" role="table">
              <div className="expectationHeader" role="row"><span>Dimension</span><span>Listing</span><span>Guest evidence</span><span>Result</span></div>
              {analysis.expectations.map((item) => <div className="expectationRow" role="row" key={item.topicId}>
                <strong>{item.label}</strong><span>{item.listingSignal}</span><span>{item.guestEvidence}</span>
                <b className={item.result}>{resultNames[item.result]}</b>
              </div>)}
            </div>
          </section>

          <section className="dataViz dataVizWide" aria-labelledby="nearby-title">
            <div className="dataVizHeading"><div><span>05</span><h3 id="nearby-title">What is available nearby?</h3></div><p>{analysis.nearby.placeCount.toLocaleString()} cached places within {analysis.nearby.radiusKm} km</p></div>
            <div className="nearbyProfile">
              <div className="nearbyCategories">
                {analysis.nearby.categories.map((category) => <div key={category.category}>
                  <div><strong>{categoryNames[category.category] || category.category}</strong><span>{category.count} · {category.within500m} within 500 m</span></div>
                  <i><b style={{ width: `${category.count / maxCategory * 100}%` }} /></i>
                  <small>{category.weightedRating === null ? "No rating" : `${category.weightedRating} weighted rating`}</small>
                </div>)}
              </div>
              <div className="nearbyLeaders">
                {analysis.nearby.topPlaces.map((place, index) => <div key={`${place.name}-${place.distanceKm}-${index}`}>
                  <MapPin size={16} /><span><strong dir="auto">{place.name}</strong><small>{categoryNames[place.category] || place.category} · {place.distanceKm} km</small></span>
                  <b>{place.rating ?? "N/A"} · {place.reviews}</b>
                </div>)}
              </div>
            </div>
          </section>

          <section className="dataViz dataVizWide" aria-labelledby="timeline-title">
            <div className="dataVizHeading"><div><span>06</span><h3 id="timeline-title">How stable are the signals month by month?</h3></div><p>Top topics across the latest 12 active months; cell intensity is the share of reviews in that month</p></div>
            {analysis.timeline.length ? <div className="signalHeatmap"><div className="signalHeatmapInner">
              <div className="heatmapHeader"><span>Topic</span>{analysis.timeline.map((period) => <b key={period.period}>{period.period.slice(5)}<small>{period.reviewCount}</small></b>)}</div>
              {analysis.timeline[0].signals.map((topic) => <div className="heatmapRow" key={topic.topicId}>
                <strong>{topic.label}</strong>{analysis.timeline.map((period) => {
                  const signal = period.signals.find((item) => item.topicId === topic.topicId)!;
                  const magnitude = Math.min(1, (signal.positiveRatePct + signal.negativeRatePct) / 20);
                  return <span key={period.period} title={`${period.period}: ${signal.positiveRatePct}% positive, ${signal.negativeRatePct}% negative`}
                    style={{ background: `linear-gradient(135deg, rgba(22,128,91,${magnitude}) ${signal.positiveRatePct >= signal.negativeRatePct ? "70%" : "25%"}, rgba(219,71,96,${magnitude}) 100%)` }}>
                    {Math.max(signal.positiveRatePct, signal.negativeRatePct)}%
                  </span>;
                })}
              </div>)}
            </div></div> : <p className="dataVizEmpty">Not enough dated reviews for a monthly signal map.</p>}
          </section>
        </div>

        <section className="dataInsights"><h3><Sparkles size={18} />Data insights</h3>
          <ol>{analysis.insights.map((insight) => <li key={insight}>{insight}</li>)}</ol>
        </section>
        <details className="dataMethod"><summary>Metric definitions and limitations<ChevronDown size={15} /></summary>
          <p><strong>Topic extraction:</strong> {analysis.methodology.topicMethod}</p>
          <p><strong>Issue Recurrence Score:</strong> {analysis.methodology.recurrenceFormula}</p>
          <p><strong>Trend:</strong> {analysis.methodology.trendMethod}</p>
          <ul>{analysis.methodology.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>Calculation version: <code>{analysis.version}</code></p>
          <p>API analysis time: <strong>{elapsedMs === null ? "N/A" : `${elapsedMs.toLocaleString()} ms`}</strong>. Warm results are held in memory and edge-cacheable.</p>
        </details>
      </> : null}
    </section>
  );
}

function trendLabel(polarity: "positive" | "negative", direction: "improving" | "worsening" | "stable") {
  if (direction === "stable") return `${polarity} signals stable`;
  if (polarity === "positive") return direction === "improving" ? "positive signals rising" : "positive signals falling";
  return direction === "improving" ? "complaints easing" : "complaints rising";
}
