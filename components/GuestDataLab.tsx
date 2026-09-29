"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, Database, MapPin, Play, RefreshCw, TriangleAlert } from "lucide-react";
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

  async function run() {
    if (running) return;
    setRunning(true); setError("");
    try {
      const response = await fetch("/api/guest_data_analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId }), signal: AbortSignal.timeout(60_000)
      });
      const payload = await response.json();
      if (!response.ok || payload.status !== "ok") throw new Error(payload.error || "Data analysis failed.");
      setAnalysis(payload.analysis);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Data analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  const visibleTopics = analysis?.topics.slice(0, 9) ?? [];
  const maxMentions = Math.max(1, ...visibleTopics.map((topic) => topic.mentionedReviews));
  const maxCategory = Math.max(1, ...(analysis?.nearby.categories.map((category) => category.count) ?? []));
  return (
    <section className="dataLab" aria-labelledby="data-lab-title">
      <div className="dataLabHeader">
        <div>
          <span className="dataLabEyebrow"><Database size={15} />Guest Data Lab</span>
          <h2 id="data-lab-title">Review Intelligence</h2>
          <p>Deterministic analytics over the complete bundled review corpus and cached neighborhood data.</p>
        </div>
        <button className="primaryButton" type="button" onClick={() => void run()} disabled={running}>
          {running ? <RefreshCw className="dataLabSpin" size={17} /> : <Play size={17} />}
          {running ? "Analyzing data..." : analysis ? "Refresh analysis" : "Analyze data"}
        </button>
      </div>
      {error ? <p className="dataLabError" role="alert"><TriangleAlert size={18} />{error}</p> : null}
      {!analysis && !running && !error ? <div className="dataLabEmpty">
        <BarChart3 size={24} /><p>Run the separate data pipeline to measure recurring topics, changes over time, expectation gaps, and nearby context.</p>
      </div> : null}
      {analysis ? <>
        <div className="dataLabCoverage">
          <div><strong>{analysis.coverage.reviewsAnalyzed.toLocaleString()}</strong><span>reviews analyzed</span></div>
          <div><strong>{analysis.coverage.reviewsWithSignals.toLocaleString()}</strong><span>reviews with measured signals</span></div>
          <div><strong>{analysis.coverage.dateFrom ?? "N/A"}</strong><span>first dated review</span></div>
          <div><strong>{analysis.coverage.dateTo ?? "N/A"}</strong><span>latest dated review</span></div>
        </div>
        <p className="dataLabScope">Full source corpus: {analysis.coverage.reviewsAnalyzed} cleaned unique reviews from {analysis.coverage.reviewsAvailable} available rows. Counts represent reviews, not keyword occurrences.</p>

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
        </div>

        <section className="dataInsights"><h3>Data insights</h3>
          <ol>{analysis.insights.map((insight) => <li key={insight}>{insight}</li>)}</ol>
        </section>
        <details className="dataMethod"><summary>Metric definitions and limitations<ChevronDown size={15} /></summary>
          <p><strong>Topic extraction:</strong> {analysis.methodology.topicMethod}</p>
          <p><strong>Issue Recurrence Score:</strong> {analysis.methodology.recurrenceFormula}</p>
          <p><strong>Trend:</strong> {analysis.methodology.trendMethod}</p>
          <ul>{analysis.methodology.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>Calculation version: <code>{analysis.version}</code></p>
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
