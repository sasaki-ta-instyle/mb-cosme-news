import { SOURCES } from "../config/sources.ts";
import { fetchAll } from "./sources/index.ts";
import { normalize, withinLookback } from "./normalize.ts";
import { keywordFilter } from "./keyword-filter.ts";
import { loadSeen, saveSeen, pruneOld, recordDelivered } from "./state.ts";
import { removeSeen, mergeCrossSource } from "./dedupe.ts";
import { scoreAndSummarize } from "./llm.ts";
import { selectTopArticles } from "./select.ts";
import { buildSlackBlocks, postToSlack } from "./slack.ts";
import type { NormalizedArticle } from "./types.ts";

const DRY_RUN = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";

async function main() {
  console.log("=== mb-cosme-news ===");
  console.log(`mode: ${DRY_RUN ? "DRY_RUN" : "LIVE"}`);
  console.log(`start: ${new Date().toISOString()}`);

  // 1. fetch
  const enabledIds = SOURCES.filter((s) => s.enabled).map((s) => s.id);
  console.log(`[fetch] sources: ${enabledIds.join(", ")}`);
  const { articles: raw, errors } = await fetchAll(enabledIds);
  console.log(`[fetch] got ${raw.length} raw articles`);
  for (const e of errors) {
    console.warn(`[fetch][warn] ${e.source}: ${e.error}`);
  }

  // 2. normalize + lookback
  const normalized: NormalizedArticle[] = raw
    .filter((a) => withinLookback(a))
    .map((a) => normalize(a));
  console.log(`[normalize] ${normalized.length} after lookback + normalize`);

  // 3. dedupe: seen + cross-source
  const seen = pruneOld(await loadSeen());
  const unseen = removeSeen(normalized, seen);
  console.log(`[dedupe] ${unseen.length} after removing previously delivered`);
  const merged = mergeCrossSource(unseen);
  console.log(`[dedupe] ${merged.length} after cross-source merge`);

  // 4. keyword filter
  const filtered = keywordFilter(merged);
  console.log(`[filter] ${filtered.length} passed keyword filter`);

  if (filtered.length === 0) {
    console.log("[done] nothing to score. exiting without posting.");
    await saveSeen(seen);
    return;
  }

  // 5. score + summarize via Claude
  console.log(`[llm] scoring ${filtered.length} articles...`);
  const scored = await scoreAndSummarize(filtered);
  console.log(`[llm] got ${scored.length} scored items`);

  // 6. select
  const selected = selectTopArticles(scored);
  console.log(`[select] selected ${selected.length} items for delivery`);

  // 7. post
  if (DRY_RUN) {
    console.log("\n--- DRY RUN PREVIEW ---");
    const { text } = buildSlackBlocks(selected);
    console.log(text);
    console.log("--- END PREVIEW ---\n");
  } else {
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ID;
    if (!token || !channel) {
      throw new Error(
        "SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set in LIVE mode",
      );
    }
    await postToSlack(selected, channel, token);
    console.log("[slack] posted");
  }

  // 8. persist seen state (delivered のみ追加)
  const updated = recordDelivered(
    seen,
    selected.map((a) => ({ id: a.id, source: a.source })),
  );
  await saveSeen(updated);
  console.log("[state] saved seen.json");
  console.log("=== done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
