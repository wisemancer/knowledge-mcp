import { type SearchResult } from '../types.js';
import { readKnowledgeBase } from '../knowledge/reader.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'for', 'on',
  'with', 'how', 'do', 'i', 'it', 'this', 'that', 'be', 'by', 'as', 'at',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 1);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkFile(file: { module: string; content: string }): Array<{ module: string; section: string; text: string }> {
  // Split on ## headings (keep heading in chunk)
  const parts = file.content.split(/(?=^## )/m);
  return parts
    .map(part => {
      const headingMatch = part.match(/^## (.+)/m);
      const heading = headingMatch?.[1]?.trim() ?? 'Overview';
      return { module: file.module, section: heading, text: stripMarkdown(part) };
    })
    .filter(c => c.text.length > 20);
}

/**
 * Lexical relevance: query-term coverage plus a small term-frequency density bonus,
 * with a heading-match boost. No embeddings, no external model. Score is bounded ~[0, 1].
 */
function scoreSection(
  queryTerms: string[],
  section: { section: string; text: string },
): number {
  const tokens = tokenize(section.text);
  if (tokens.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const headingTokens = new Set(tokenize(section.section));

  let matched = 0;
  let occurrences = 0;
  let headingHits = 0;
  for (const term of queryTerms) {
    const tf = freq.get(term) ?? 0;
    if (tf > 0) matched++;
    occurrences += tf;
    if (headingTokens.has(term)) headingHits++;
  }
  if (matched === 0) return 0;

  const coverage = matched / queryTerms.length;
  const density = Math.min(0.2, occurrences / tokens.length);
  const headingBoost = Math.min(0.2, (headingHits / queryTerms.length) * 0.2);
  return Math.min(1, coverage * 0.7 + density + headingBoost);
}

export async function searchKnowledge(
  projectDir: string,
  query: string,
  topK: number,
): Promise<SearchResult[]> {
  const queryTerms = tokenize(query).filter(t => !STOPWORDS.has(t));
  if (queryTerms.length === 0) return [];

  const files = await readKnowledgeBase(projectDir);
  const chunks = files.flatMap(chunkFile);

  const scored: SearchResult[] = chunks
    .map(c => ({ module: c.module, section: c.section, text: c.text, score: scoreSection(queryTerms, c) }))
    .filter(r => r.score > 0);

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
