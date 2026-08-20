// Frequency-based entity extraction (ai-memory style).
// Produces up to `max` canonical keywords from note body + title so
// recall can find a page even when the query wording differs from the body.

const STOP_WORDS = new Set([
  // English
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "has", "him", "his", "how", "new",
  "now", "old", "see", "two", "way", "who", "did", "its", "let", "put",
  "say", "she", "too", "use", "that", "with", "have", "this", "will",
  "your", "from", "they", "know", "want", "been", "good", "much", "some",
  "time", "very", "when", "come", "here", "just", "like", "long", "make",
  "many", "more", "only", "over", "such", "take", "than", "them", "well",
  "were", "would", "about", "could", "great", "little", "other", "their",
  "there", "these", "thing", "which", "should", "might", "still", "under",
  "where", "again", "world", "house", "while", "every", "going", "place",
  "think", "right", "work", "help", "before", "after", "also", "because",
  "between", "first", "people", "project", "using", "used",
  "need", "needs", "made", "gets", "get",
  // Russian
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а",
  "то", "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же",
  "вы", "за", "бы", "по", "только", "ее", "мне", "было", "вот", "от",
  "меня", "еще", "нет", "о", "из", "ему", "теперь", "когда", "даже",
  "ну", "вдруг", "ли", "если", "уже", "или", "ни", "быть", "был", "него",
  "до", "вас", "опять", "уж", "вам", "ведь", "там", "потом", "себя",
  "ничего", "ей", "может", "они", "тут", "где", "есть", "надо", "ней",
  "для", "мы", "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто",
  "чего", "раз", "тоже", "себе", "под", "будет", "ж", "тогда", "кто",
  "этот", "того", "потому", "этого", "какой", "совсем", "ним", "здесь",
  "этом", "один", "почти", "мой", "тем", "чтобы", "нее", "сейчас", "были",
  "куда", "зачем", "всех", "никогда", "можно", "при", "наконец", "два",
  "об", "другой", "хоть", "после", "над", "больше", "тот", "через", "эти",
  "нас", "про", "всего", "них", "какая", "много", "разве", "три", "эту",
  "моя", "впрочем", "хорошо", "свою", "этой", "перед", "иногда", "лучше",
  "чуть", "том", "нельзя", "такой", "им", "более", "всегда", "конечно",
  "всю", "между", "нужно", "будем", "будете",
]);

// Strip markdown syntax so we count prose tokens, not formatting.
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/[*_>~|+]/g, " ");
}

export function extractEntities(
  body: string,
  title = "",
  max = 10,
): string[] {
  const text = stripMarkdown(`${title} ${body}`).toLowerCase();
  const tokens = text.match(/[a-zа-яё][a-zа-яё0-9-]{2,}/g) ?? [];

  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (/^\d+$/.test(token)) continue;
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word]) => word);
}
